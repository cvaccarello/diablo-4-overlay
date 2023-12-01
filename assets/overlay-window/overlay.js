
const $ = require('jquery');
const { ipcRenderer } = require('electron');

import {
	canvasClipped,
	cleanCanvas,
	isPixelColored,
	isPixelBlack,
	colorIsInRange,
	pointIsInBox,
	boxIsCollidingBox
} from '../js/helpers.js';

// small text helper to replace a chunk of text with some other text
String.prototype.replaceAt = function(index, replacement) {
	return this.substring(0, index) + replacement + this.substring(index + replacement.length);
};


class Overlay {
	constructor() {
		this.matchData = [];
		this.debug = false;
		this.boxPadding = 6;
		this.scanRegionTopCrop = 160;
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

		// the text color for the bottom "required" level text
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
		this.renderTimer = Date.now();

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
		const fps = 1000 / (Date.now() - this.renderTimer);
		this.renderTimer = Date.now();

		// with a slight timeout on the render requestAnimationFrame, we're able to more easily step through and debug what's happening visually for problem solving purposes
		if (this.debug) {
			await new Promise((resolve) => setTimeout(resolve, 0));
		}

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

				// { y: 0, height: 200 },
				// { y: 200, height: 60 },
				// { y: 260, height: scanRegionBox.height - 200 - 60 },

				// { y: 0, height: 115 },
				// { y: 115, height: 35 },
				// { y: 145, height: 60 },
				// { y: 200, height: 60 },
				// { y: 260, height: scanRegionBox.height - 115 - 35 - 60 - 60 },
			];

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

		this.context.font = 'bold 12px serif';
		this.context.fillStyle = 'red';
		this.context.fillText('FPS:     ' + fps.toFixed(2).toString(), 5, 12);
		this.context.fillText('Items:  ' + boxes.length.toString(), 5, 24);

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
			if ((box1 && pointIsInBox({ x, y }, box1, this.boxPadding)) || (box2 && pointIsInBox({ x, y }, box2, this.boxPadding))) {
				continue;
			}

			if (colorIsInRange({ r, g, b }, this.itemLegendaryBorderColor) || colorIsInRange({ r, g, b }, this.itemRareBorderColor)) {
				if (!box1) {
					box1 = this._getBox(imageData, { x, y });
				} else if (!box2) {
					box2 = this._getBox(imageData, { x, y });
				}

				// ignore colliding boxes, replacing the first box with the second box if it's bigger
				if (box1 && box2 && boxIsCollidingBox(box1, box2)) {
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
		if (!(colorIsInRange({ r: r1, g: g1, b: b1 }, this.itemLegendaryBorderColor) || colorIsInRange({ r: r1, g: g1, b: b1 }, this.itemRareBorderColor)) &&
			!(colorIsInRange({ r: r2, g: g2, b: b2 }, this.itemLegendaryBorderColor) || colorIsInRange({ r: r2, g: g2, b: b2 }, this.itemRareBorderColor))) {
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

			if (!colorIsInRange({ r, g, b }, this.itemLegendaryBorderColor) && !colorIsInRange({ r, g, b }, this.itemRareBorderColor)) {
				incorrectPixelColors++;
			}

			// trying to weed out false positive boxes by trying to make sure most pixels are the proper color
			// TODO: need to adjust this to ignore top-right corner where items often stick up and overlap the border
			if (incorrectPixelColors > 100) {
				return null;
			}

			// once the black border is detected we can stop
			if (colorIsInRange({ r, g, b }, this.itemEndBorderColor)) {
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
			if (colorIsInRange({ r, g, b }, this.itemEndBorderColor)) {
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

			if (colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || colorIsInRange({ r, g, b }, this.itemRequiredTextColor) || isPixelColored({ r, g, b }) || isPixelBlack({ r, g, b })) {
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

			if (colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || colorIsInRange({ r, g, b }, this.itemRequiredTextColor) || isPixelColored({ r, g, b }) || isPixelBlack({ r, g, b })) {
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
			if (colorIsInRange({ r, g, b }, this.itemEquippedBoxColor)) {
				return true;
			}
		}

		return false;
	}

	_checkAndRenderResults(results, scanRegionBox) {
		// TODO: construct our own paragraphs as tesseract OCR is struggling a bit (this approach works really well however we lose the extra OCR details which help with the accuracy)
		// using a positive lookahead split regex so that only the new line is ultimately removed when splitting
		let paragraphs = results.text
			// remove extra new lines, easier to assume everything is on 1 new line rather than multiple
			.replace(/\n{2,}/g, '\n')
			// find new lines where bullet points exist (but don't remove character associated with bullet point yet)
			.split(/\n(?=[©@%+o0£]?\s)|\n(?=[O0])/i)
			// map to a nice object with some placeholders that get filled out later
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
