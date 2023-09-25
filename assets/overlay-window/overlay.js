
const $ = require('jquery');
const { ipcRenderer } = require('electron');

String.prototype.replaceAt = function(index, replacement) {
	return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};

class RGBA {
	constructor({ r = 0, g = 0, b = 0, a = 1 } = {}) {
		this.r = r;
		this.g = g;
		this.b = b;
		this.a = a;

		return this;
	}

	set({ r, g, b, a }) {
		if (r) {
			this.r = r;
		}

		if (g) {
			this.g = g;
		}

		if (b) {
			this.b = b;
		}

		if (a) {
			this.a = a;
		}

		return this;
	}

	toString() {
		return `rgba(${this.r},${this.g},${this.b},${this.a})`;
	}

	static componentToHex(c) {
		let hex = c.toString(16);
		return hex.length === 1 ? '0' + hex : hex;
	}

	static rgbToHex(r, g, b) {
		return "#" + RGBA.componentToHex(r) + RGBA.componentToHex(g) + RGBA.componentToHex(b);
	}

	static hexToRGB(hex) {
		let result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? {
			r: parseInt(result[1], 16),
			g: parseInt(result[2], 16),
			b: parseInt(result[3], 16)
		} : {
			r: 0,
			g: 0,
			b: 0,
		};
	}

	static RGBToHSL(r, g, b) {
		let cMax = Math.max(r, g, b),
			cMin = Math.min(r, g, b),
			delta = cMax - cMin,
			l = (cMax + cMin) / 2,
			h = 0,
			s = 0;

		if (delta === 0) {
			h = 0;
		} else if (cMax === r) {
			h = 60 * (((g - b) / delta) % 6);
		} else if (cMax === g) {
			h = 60 * (((b - r) / delta) + 2);
		} else {
			h = 60 * (((r - g) / delta) + 4);
		}

		if (delta === 0) {
			s = 0;
		} else {
			s = (delta/(1-Math.abs(2*l - 1)))
		}

		return {
			h: h,
			s: s,
			l: l
		}
	}

	static HSLToRGB(h, s, l) {
		let c = (1 - Math.abs(2*l - 1)) * s,
			x = c * ( 1 - Math.abs((h / 60 ) % 2 - 1 )),
			m = l - c/ 2,
			r, g, b;

		if (h < 60) {
			r = c;
			g = x;
			b = 0;
		} else if (h < 120) {
			r = x;
			g = c;
			b = 0;
		} else if (h < 180) {
			r = 0;
			g = c;
			b = x;
		} else if (h < 240) {
			r = 0;
			g = x;
			b = c;
		} else if (h < 300) {
			r = x;
			g = 0;
			b = c;
		} else {
			r = c;
			g = 0;
			b = x;
		}

		// r = RGBA.normalize_rgb_value(r, m);
		// g = RGBA.normalize_rgb_value(g, m);
		// b = RGBA.normalize_rgb_value(b, m);

		return {
			r,
			g,
			b
		};
	}
}


class Overlay {
	constructor() {
		this.matchData = [];
		this.debug = false;
		this.boxPadding = 6;
		this.scanRegionTopCrop = 165;
		this.scanRegionBottomCrop = 100;
		let colorBuffer = 10;

		this.itemLegendaryBorderColor = {
			r: {
				min: 166 - colorBuffer,
				max: 219 + colorBuffer,
			},
			g: {
				min: 123 - colorBuffer,
				max: 191 + colorBuffer,
			},
			b: {
				min: 52 - colorBuffer,
				max: 108 + colorBuffer
			}
		};

		this.itemRareBorderColor = {
			r: {
				min: 177 - colorBuffer,
				max: 197 + colorBuffer,
			},
			g: {
				min: 156 - colorBuffer,
				max: 181 + colorBuffer,
			},
			b: {
				min: 15 - colorBuffer,
				max: 21 + colorBuffer
			}
		};

		this.itemEndBorderColor = {
			r: {
				min: 0,
				max: 21,
			},
			g: {
				min: 0,
				max: 21,
			},
			b: {
				min: 0,
				max: 20
			}
		};

		this.itemTextColor = {
			h: {
				min: 26,
				max: 45,
			},
			s: {
				min: 0,
				max: 255,
			},
			l: {
				min: 50,
				max: 255,
			},
			r: {
				min: 80,
				max: 230,
			},
			g: {
				min: 50,
				// min: 80,
				max: 250,
			},
			b: {
				min: 0,
				// min: 80,
				max: 250
			}
		};

		this.itemLegendaryTextColor = {
			r: {
				min: 220,
				max: 255,
			},
			g: {
				min: 110,
				max: 150,
			},
			b: {
				min: 0,
				max: 20
			}
		};

		this.itemRequiredTextColor = {
			r: {
				min: 190,
				max: 255,
			},
			g: {
				min: 190,
				max: 255,
			},
			b: {
				min: 190,
				max: 255
			}
		};

		this.itemEquippedBoxColor = {
			r: {
				min: 130,
				max: 163,
			},
			g: {
				min: 130,
				max: 163,
			},
			b: {
				min: 130,
				max: 163
			}
		};
	}

	async initialize() {
		this.debug = await ipcRenderer.invoke('get-debug-flag');

		this.video = $('<video>')[0];
		this.canvas = $('canvas.transparent')[0];
		this.$canvasBox1 = $('<canvas class="box1">');
		this.$canvasBox2 = $('<canvas class="box2">');
		this.canvasBox1 = this.$canvasBox1[0];
		this.canvasBox2 = this.$canvasBox2[0];
		this.context = this.canvas.getContext('2d');
		this.contextBox1 = this.canvasBox1.getContext('2d', { willReadFrequently: true });
		this.contextBox2 = this.canvasBox2.getContext('2d', { willReadFrequently: true });
		this.matchData = await ipcRenderer.invoke('get-update-data');

		await this.setSource(await ipcRenderer.invoke('get-input-source'));

		// add debug boxes to help visually see what the app is processing for the diablo "items"
		if (this.debug) {
			$('body').append(this.canvasBox1).append(this.canvasBox2);
		}
	}

	activate() {
		ipcRenderer.on('update-data', (event, data) => {
			this.matchData = data;
		});
	}

	// Change the videoSource window to record
	async setSource(source) {
		const constraints = {
			audio: false,
			video: {
				mandatory: {
					chromeMediaSource: 'desktop',
					chromeMediaSourceId: source.id
				}
			}
		};

		// Create a Stream
		const stream = await navigator.mediaDevices
			.getUserMedia(constraints);

		// Preview the source in a video element
		this.video.srcObject = stream;
		this.video.play();

		let { width, height } = stream.getVideoTracks()[0].getSettings();
		this.offScreenCanvas = new OffscreenCanvas(width, height);
		this.offScreenContext = this.offScreenCanvas.getContext('2d', { willReadFrequently: true });
		this.width = width;
		this.height = height;
		this.canvas.width = this.width;
		this.canvas.height = this.height;

		this.render().catch(console.error);
	}

	async render() {
		console.time();
		this.offScreenContext.drawImage(this.video, 0, 0, this.width, this.height);
		const imageData = this.offScreenContext.getImageData(0, 0, this.width, this.height);
		let boxes = this._scanForBoxes(imageData);
		let scanRegionBoxes = [];

		// try to ignore equipped box to cut processing times in half
		if (boxes[0] && this._isEquippedItem(boxes[0], imageData)) {
			boxes.splice(0, 1);
		} else if (boxes[1] && this._isEquippedItem(boxes[1], imageData)) {
			boxes.splice(1, 1);
		}

		if (boxes[0]) {
			let modifiedBox = this._getModifiedOptimizedBox(boxes[0]);

			scanRegionBoxes.push(modifiedBox);

			this.$canvasBox1.css('translate', `${modifiedBox.x}px ${modifiedBox.y}px`);
			this.canvasBox1.width = modifiedBox.width;
			this.canvasBox1.height = modifiedBox.height;
			// this.contextBox1.clearRect(0, 0, this.canvasBox1.width, this.canvasBox1.height);
			this.contextBox1.drawImage(this.video, modifiedBox.x, modifiedBox.y, this.canvasBox1.width, this.canvasBox1.height, 0, 0, this.canvasBox1.width, this.canvasBox1.height);
			this._cleanBox(this.canvasBox1, this.contextBox1);
		}

		if (boxes[1]) {
			let modifiedBox = this._getModifiedOptimizedBox(boxes[1]);

			scanRegionBoxes.push(modifiedBox);

			this.$canvasBox2.css('translate', `${modifiedBox.x}px ${modifiedBox.y}px`);
			this.canvasBox2.width = modifiedBox.width;
			this.canvasBox2.height = modifiedBox.height;
			// this.contextBox2.clearRect(0, 0, this.canvasBox2.width, this.canvasBox2.height);
			this.contextBox2.drawImage(this.video, modifiedBox.x, modifiedBox.y, this.canvasBox2.width, this.canvasBox2.height, 0, 0, this.canvasBox2.width, this.canvasBox2.height);
			this._cleanBox(this.canvasBox2, this.contextBox2);
		}

		let promises = [];

		if (boxes[0]) {
			// process OCR on the node.js backend for speed purposes
			const img1 = this.canvasBox1.toDataURL('image/png');
			promises.push(ipcRenderer.invoke('ocr-process', img1));
		}

		if (boxes[1]) {
			// process OCR on the node.js backend for speed purposes
			const img2 = this.canvasBox2.toDataURL('image/png');
			promises.push(await ipcRenderer.invoke('ocr-process', img2));
		}

		const [ results1, results2 ] = await Promise.all(promises);

		this.context.clearRect(0, 0, this.width, this.height);

		if (this.debug) {
			this.context.drawImage(this.video, 0, 0, this.width, this.height);
		}

		if (boxes[0]) {
			this._checkAndRenderResults(results1, scanRegionBoxes[0], boxes[0]);
		}

		if (boxes[1]) {
			this._checkAndRenderResults(results2, scanRegionBoxes[1], boxes[1]);
		}


		console.timeEnd();

		requestAnimationFrame(() => {
			this.render();
		});
	}

	/**
	 * loop over pixels until we find colors in the range that indicate an item box (2 max)
	 * @param imageData
	 * @private
	 */
	_scanForBoxes(imageData) {
		let box1 = null;
		let box2 = null;
		// let ignoreBoxes = [];

		// jump every other pixel (i.e., i+8), as we don't need super precision and would prefer speed
		for (let i=0; i<=imageData.data.length; i+=8) {
			let x = (i / 4) % imageData.width;
			let y = Math.floor((i / 4) / imageData.width);
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			// skip pixels inside predefined boxes
			if ((box1 && this._pointIsInBox({ x, y }, box1)) || (box2 && this._pointIsInBox({ x, y }, box2))) {
				continue;
			}

			if (this._colorIsInRange({ r, g, b }, this.itemLegendaryBorderColor) || this._colorIsInRange({ r, g, b }, this.itemRareBorderColor)) {
				if (!box1) {
					box1 = this._getBox(imageData, { x, y });
				} else if (!box2) {
					box2 = this._getBox(imageData, { x, y });
				}

				// ignore colliding boxes, replacing the first box with the second box if it's bigger
				if (box1 && box2 && this._boxIsCollidingBox(box1, box2)) {
					if (box2.width > box1.width) {
						box1 = box2;
					}

					box2 = null;
				}
			}

			// we can stop once we've found the maximum number of possible boxes OR we're more than half-way down the screen
			if ((box1 && box2) || (y > imageData.height / 2)) {
				break;
			}
		}

		return [ box1, box2 ];
	}

	_colorIsInRange(color, range) {
		return color.r >= range.r.min && color.r <= range.r.max && color.g >= range.g.min && color.g <= range.g.max && color.b >= range.b.min && color.b <= range.b.max;
	}

	_colorIsInRangeHSL(color, range) {
		let hsl = RGBA.RGBToHSL(color.r, color.g, color.b);
		return hsl.h >= range.h.min && hsl.h <= range.h.max && hsl.l >= range.l.min && hsl.l <= range.l.max;
	}

	_pointIsInBox(point, box) {
		let extraPadding = (this.boxPadding * 1.5);
		return point.x >= box.x - extraPadding && point.x <= box.x - extraPadding + box.width + (extraPadding * 2) && point.y >= box.y - extraPadding && point.y <= box.y - extraPadding + box.height + (extraPadding * 2);
	}

	_boxIsCollidingBox(box1, box2) {
		return box1.x < box2.x + box2.width &&
			box1.x + box1.width > box2.x &&
			box1.y < box2.y + box2.height &&
			box1.y + box1.height > box2.y;
	}

	/**
	 * starting in the top-left corner of what we think is a box, try to identify and return the box
	 * @param imageData
	 * @param point
	 * @returns {{x: number, width: number, y: number, height: number}|null}
	 * @private
	 */
	_getBox(imageData, point) {
		let startingWidth = 100;
		let startingHeight = 400;
		let box = {
			x: point.x,
			y: point.y,
			width: 0,
			height: 0
		};

		// check for duplicate color X pixels over from the starting point, just as a quick confirmation of the proper box being found
		let i1 = ((point.x + 100) + (point.y * imageData.width)) * 4;
		let r1 = imageData.data[i1 + startingWidth];
		let g1 = imageData.data[i1 + startingWidth + 1];
		let b1 = imageData.data[i1 + startingWidth + 2];
		let i2 = ((point.x + 100 + 70) + (point.y * imageData.width)) * 4;
		let r2 = imageData.data[i2 + startingWidth];
		let g2 = imageData.data[i2 + startingWidth + 1];
		let b2 = imageData.data[i2 + startingWidth + 2];

		// double check that we have a real box before starting scan for box coordinates
		if (!(this._colorIsInRange({ r: r1, g: g1, b: b1 }, this.itemLegendaryBorderColor) || this._colorIsInRange({ r: r1, g: g1, b: b1 }, this.itemRareBorderColor)) &&
			!(this._colorIsInRange({ r: r2, g: g2, b: b2 }, this.itemLegendaryBorderColor) || this._colorIsInRange({ r: r2, g: g2, b: b2 }, this.itemRareBorderColor))) {
			return null;
		}

		// scan to the right, starting X pixels over to jump start the process of box identification
		// jump every other pixel (i.e., i+8), as we don't need super precision and would prefer speed
		let initialX = ((point.x + startingWidth) + (point.y * imageData.width)) * 4;
		let incorrectPixelColors = 0;

		for (let i=initialX; i<=initialX + (500 * 4); i+=8) {
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			if (!this._colorIsInRange({ r, g, b }, this.itemLegendaryBorderColor) && !this._colorIsInRange({ r, g, b }, this.itemRareBorderColor)) {
				incorrectPixelColors++;
			}

			// trying to weed out false positive boxes by trying to make sure most pixels are the proper color
			// TODO: need to adjust this to ignore top-right corner where items often stick up and overlap the border
			if (incorrectPixelColors > 100) {
				return null;
			}

			// once the black border is detected we can stop
			if (this._colorIsInRange({ r, g, b }, this.itemEndBorderColor)) {
				let x = (i / 4) % imageData.width;
				box.width = x - point.x;
				break;
			}
		}

		// any box with too little or great of a dimensions will be thrown out / ignored
		if (box.width <= 300 || box.width >= 500) {
			return null;
		}

		// scan downward, starting Y pixels down to jump start the process of box identification
		// jump every other pixel (i.e., width*2), as we don't need super precision and would prefer speed
		let initialY = ((point.x) + ((point.y + startingHeight) * imageData.width)) * 4;
		for (let i=initialY; i<=imageData.data.length; i+=(imageData.width * 4 * 2)) {
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			// once the black border is detected we can stop
			if (this._colorIsInRange({ r, g, b }, this.itemEndBorderColor)) {
				let y = Math.floor((i / 4) / imageData.width);
				box.height = y - point.y;
				break;
			}
		}

		// any box with too little or great of a dimensions will be thrown out / ignored
		if (box.height <= 0 || box.height >= imageData.height) {
			return null;
		}

		// shrink box a bit, so it doesn't include brightly colored borders OR most of the top part of box that's not relevant to stats
		box.x += this.boxPadding;
		box.y += this.boxPadding;
		box.width -= (this.boxPadding * 2);
		box.height -= (this.boxPadding * 2);

		return box;
	}

	_getModifiedOptimizedBox(box) {
		let modifiedBox = {
			x: box.x,
			y: box.y + this.scanRegionTopCrop,
			width: box.width,
			height: box.height - this.scanRegionTopCrop - this.scanRegionBottomCrop,
		};

		// try to shrink box further by checking for white "damage" or "armor" text color, which appear at the top of item boxes
		// start half-way down the box, b/c we know what we're looking for is towards the top, and we want to get the bottom-most location
		let initialTopY = Math.round(modifiedBox.height * 0.4);
		let croppedTopImageData = this.offScreenContext.getImageData(modifiedBox.x, modifiedBox.y, modifiedBox.width, modifiedBox.height - initialTopY);

		// jump every X pixels, we shouldn't need extreme precision here, just any general idea of where the crop should be
		for (let i=croppedTopImageData.data.length; i>0; i-=(4 * 5)) {
			let r = croppedTopImageData.data[i];
			let g = croppedTopImageData.data[i + 1];
			let b = croppedTopImageData.data[i + 2];

			if (this._colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || this._colorIsInRange({ r, g, b }, this.itemRequiredTextColor)) {
				let y = Math.floor((i / 4) / croppedTopImageData.width);
				modifiedBox.y += (y + 8);
				modifiedBox.height -= (y + 8);
				break;
			}
		}

		// try to shrink box further by checking for the orange (legendary) or white (level required) text color, which appear at the bottom of item boxes
		// start half-way down the box, b/c we know what we're looking for is towards the bottom, and we want to get the top-most location
		let initialBottomY = Math.round(modifiedBox.height * 0.4);
		let croppedBottomImageData = this.offScreenContext.getImageData(modifiedBox.x, modifiedBox.y + initialBottomY, modifiedBox.width, modifiedBox.height - initialBottomY);

		// jump every X pixels, we shouldn't need extreme precision here, just any general idea of where the crop should be
		for (let i=0; i<croppedBottomImageData.data.length; i+=(4 * 5)) {
			let r = croppedBottomImageData.data[i];
			let g = croppedBottomImageData.data[i + 1];
			let b = croppedBottomImageData.data[i + 2];

			if (this._colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || this._colorIsInRange({ r, g, b }, this.itemRequiredTextColor)) {
				let y = Math.floor((i / 4) / croppedBottomImageData.width);
				modifiedBox.height -= (modifiedBox.height - (initialBottomY + y - 8));
				break;
			}
		}

		return modifiedBox;
	}

	_isEquippedItem(box, imageData) {
		// start X% over on the X axis and look upwards, at most 100 pixels, for the "EQUIPPED" box
		let initialY = ((box.x + Math.round(box.width * 0.25)) + (box.y * imageData.width)) * 4;
		for (let i=initialY; i>=initialY - (imageData.width * 4 * 100) && i >= 0; i-=(imageData.width * 4 * 2)) {
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			// once the white equipped box is detected we can stop
			if (this._colorIsInRange({ r, g, b }, this.itemEquippedBoxColor)) {
				return true;
			}
		}

		return false;
	}

	_cleanBox(canvas, context) {
		let imageData = context.getImageData(0, 0, canvas.width, canvas.height);

		for (let i=0; i<imageData.data.length; i+=4) {
			// let hsl = RGBA.RGBToHSL(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);

			// grayscale text and convert all non-text to black pixels for easier readability
			if (!this._colorIsInRange({ r: imageData.data[i], g: imageData.data[i + 1], b: imageData.data[i + 2] }, this.itemTextColor)) {
			// if (!(hsl.l >= this.itemTextColor.l.min && hsl.l <= this.itemTextColor.l.max)) {
				imageData.data[i] = 0;
				imageData.data[i + 1] = 0;
				imageData.data[i + 2] = 0;
			} else {
				let grayscale = Math.round((imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3);
				imageData.data[i] = grayscale;
				imageData.data[i + 1] = grayscale;
				imageData.data[i + 2] = grayscale;
			}
		}

		context.putImageData(imageData, 0, 0);
	}

	_checkAndRenderResults(results, scanRegionBox, outerBox) {
		// TODO: construct our own paragraphs as tesseract OCR is struggling a bit (this approach works really well however we lose the extra OCR details which help with the accuracy)
		// using a positive lookahead split regex so that only the new line is ultimately removed when splitting
		let paragraphs = results.text
			.split(/\n(?=[©@%+o0£]?\s)|\n(?=[O0])/i)
			.map((paragraph) => {
				return {
					text: paragraph.replace('\n', ' ').trim(),
					bbox: { x0: 10000, y0: 10000, x1: 0, y1: 0 },
					lines: []
				};
			});

		// figure out which OCR line goes with which paragraph
		for (let line of results.lines) {
			let paragraph = paragraphs.find((p) => {
				return p.text.indexOf(line.text.replace('\n', ' ').trim()) >= 0;
			});

			paragraph.bbox.x0 = Math.min(paragraph.bbox.x0, line.bbox.x0);
			paragraph.bbox.y0 = Math.min(paragraph.bbox.y0, line.bbox.y0);
			paragraph.bbox.x1 = Math.max(paragraph.bbox.x1, line.bbox.x1);
			paragraph.bbox.y1 = Math.max(paragraph.bbox.y1, line.bbox.y1);
			paragraph.lines.push(line);
		}

		// clean up the OCR results
		for (let paragraph of paragraphs) {
			// start by combining lines into 1 line and removing the single character of junk that ultimately is just a bullet character
			let text = paragraph.text.replace(/\n/gi, ' ').replace(/^.+?\s/gi, '');
			let matchString = this.matchData.map((data) => data.name).join('|');
			let textRegex = new RegExp(`.*?(\\d+\.?\\d+?).*?\\s.*?(${matchString}).*?\\[?(\\d+\.?\\d?)\\s?-\\s?(\\d+\.?\\d?)]?(%?)`, 'i');
			let preMatch = text.match(/([\[|{(1l!\\/:;]\d+\.\d\s?-\s?\d+\.\d[\]|)}1l!\\/:;])%?/i);

			// sometimes the first and last character between min and max (i.e., [min - max] can be difficult to tell the difference between [] and the number 1 (or other characters)
			// this will try to force the characters
			if (preMatch) {
				let index = text.indexOf(preMatch[1]);
				text = text.replaceAt(index, '[');
				text = text.replaceAt(index + preMatch[1].length - 1, ']');
			}

			let [ all, value, match, min, max, percentage ] = text.match(textRegex) || [];
			console.log(text);

			if (match) {
				console.log('---', value, match, min, max, percentage);
				let percentageToMax = 100 * (value - min) / (max - min);
				let matchPercentage = this.matchData.find((item) => {
					return item.name.toLowerCase() === match.toLowerCase();
				}).percentage;

				if (percentageToMax >= matchPercentage) {
					this.context.strokeStyle = 'red';
					this.context.lineWidth = 2;
					this.context.beginPath();
					this.context.rect(
						scanRegionBox.x + paragraph.bbox.x0 - 5,
						scanRegionBox.y + paragraph.bbox.y0 - 5,
						paragraph.bbox.x1 - paragraph.bbox.x0 + 5 + 2,
						paragraph.bbox.y1 - paragraph.bbox.y0 + 5 + 2
					);
					this.context.stroke();
				}
			}
		}

		if (this.debug) {
			this.context.strokeStyle = 'yellow';
			this.context.lineWidth = 2;
			this.context.beginPath();
			this.context.rect(outerBox.x - this.boxPadding, outerBox.y - this.boxPadding, outerBox.width + (this.boxPadding * 2), outerBox.height + (this.boxPadding * 2));
			this.context.stroke();
			this.context.strokeStyle = 'blue';
			this.context.lineWidth = 2;
			this.context.beginPath();
			this.context.rect(scanRegionBox.x, scanRegionBox.y, scanRegionBox.width, scanRegionBox.height);
			this.context.stroke();
		}
	}
}

let overlay = new Overlay();
await overlay.initialize();
overlay.activate();
