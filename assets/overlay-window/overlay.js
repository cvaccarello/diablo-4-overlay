
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
		this.scanRegionBottomCrop = 50;
		this.textLineSpacing = 4;
		this.lineHeight = 25;
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

		// the text color for the [ min - max ] stat text
		this.itemMinMaxTextColor = {
			r: {
				min: 155 - 5,
				max: 155 + 5,
			},
			g: {
				min: 155 - 5,
				max: 155 + 5,
			},
			b: {
				min: 155 - 5,
				max: 155 + 5
			}
		};

		// the divider color primarily on weapon stats to separate weapon stats from the rest of the stats
		this.itemDividerColor = {
			r: {
				min: 79 - 10,
				max: 79 + 10,
			},
			g: {
				min: 79 - 10,
				max: 79 + 10,
			},
			b: {
				min: 72 - 10,
				max: 72 + 10
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
		let boxes = this._scanForItemBoxes(imageData).filter((box) => {
			// try to ignore equipped box to cut processing times in half
			return box && !this._isEquippedItem(box, imageData);
		});
		let scanRegionBoxes = [];
		let promisePieces = [];

		// hopefully at this point there's just 1 box, but sometimes there could be more than 1 if we couldn't figure out which one was equipped vs not equipped on the character
		for (let i=0; i<boxes.length; i++) {
			let box = boxes[i];
			let scanRegionBox = this._getModifiedOptimizedBox(box);
			let $canvas = this['$canvasBox' + (i + 1)];
			let canvas = this['canvasBox' + (i + 1)];
			let context = this['contextBox' + (i + 1)];

			scanRegionBox.itemBox = box;
			scanRegionBox.promiseStatBox = [];
			scanRegionBox.resultStatBox = [];

			// we'll eventually find bullet point "stat" boxes manually instead of through OCR for speed purposes
			scanRegionBox.statBoxes = [];

			// draw & process first 2 item boxes and that's it for now
			if (i > 2 || !$canvas) {
				continue;
			}

			// position and clean up canvas pre-OCR processing, removing any remaining non-text noise
			$canvas.css('translate', `${scanRegionBox.x}px ${scanRegionBox.y}px`);
			canvas.width = scanRegionBox.width;
			canvas.height = scanRegionBox.height;
			context.drawImage(this.video, scanRegionBox.x, scanRegionBox.y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

			scanRegionBox.statBoxes = this._getStatBoxes(canvas, scanRegionBox);

			cleanCanvas(canvas, this.itemTextColor);

			// process bullet point stat boxes
			for (let j=0; j<scanRegionBox.statBoxes.length; j++) {
				let statBox = scanRegionBox.statBoxes[j];
				let { canvas: canvasStat } = canvasClipped(canvas, statBox);

				promisePieces.push(
					scanRegionBox.promiseStatBox[j] = ipcRenderer.invoke('ocr-process', canvasStat.toDataURL('image/png')).then((result) => {
						scanRegionBox.resultStatBox[j] = result;
					})
				);
			}

			// add box to list for post-OCR processing and clean up
			scanRegionBoxes.push(scanRegionBox);
		}

		// wait for all the OCR pieces to process before continuing
		await Promise.all(promisePieces);


		///*********** BEGIN ACTUAL RENDERING ONCE PROCESSING FINISHED ***********///

		this.context.clearRect(0, 0, this.width, this.height);

		if (this.debug) {
			this.context.drawImage(this.video, 0, 0, this.width, this.height);
		}

		for (let i=0; i<scanRegionBoxes.length; i++) {
			let scanRegionBox = scanRegionBoxes[i];
			let itemBox = scanRegionBox.itemBox;

			for (let j=0; j<scanRegionBox.statBoxes.length; j++) {
				let statBox = scanRegionBox.statBoxes[j];
				let result = scanRegionBox.resultStatBox[j];

				this._checkAndRenderResults(result, { x: scanRegionBox.x + statBox.x, y: scanRegionBox.y + statBox.y });
			}

			if (this.debug) {
				this.context.strokeStyle = 'yellow';
				this.context.lineWidth = 2;
				this.context.beginPath();
				this.context.rect(itemBox.x - this.boxPadding, itemBox.y - this.boxPadding, itemBox.width + (this.boxPadding * 2), itemBox.height + (this.boxPadding * 2));
				this.context.stroke();
				this.context.strokeStyle = 'blue';
				this.context.lineWidth = 2;
				this.context.beginPath();
				this.context.rect(scanRegionBox.x, scanRegionBox.y, scanRegionBox.width, scanRegionBox.height);
				this.context.stroke();
			}
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
	_scanForItemBoxes(imageData) {
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


		// one last double check to make sure there's some black pixels nearby to the left, indicating for sure that this is a item box (there was still a lot of false positives happening)
		let initialBoxX = (point.x + (point.y * imageData.width)) * 4;
		let correctPreBlackBorderPixelColors = 0;

		// double check that X of the previous Y pixels are black, indicating a proper item box and hopefully remove some false positives
		for (let i=initialBoxX; i>initialBoxX - (20 * 4) ; i-=4) {
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			if (colorIsInRange({ r, g, b }, this.itemEndBorderColor)) {
				correctPreBlackBorderPixelColors++;
			}
		}

		// if there aren't at least X black pixels before the starting position, then this is a false positive
		if (correctPreBlackBorderPixelColors < 4) {
			return null;
		}

		return box;
	}

	_getModifiedOptimizedBox(box) {
		let modifiedBox = {
			x: box.x,
			y: box.y + this.scanRegionTopCrop,
			width: box.width,
			height: box.height - this.scanRegionTopCrop - this.scanRegionBottomCrop,
		};
		let initialTopY = Math.round(modifiedBox.height * 0.5);
		let initialBottomY = Math.round(modifiedBox.height * 0.5);
		let croppedTopImageData = this.offScreenContext.getImageData(modifiedBox.x, modifiedBox.y, modifiedBox.width, modifiedBox.height - initialTopY);
		let croppedBottomImageData = this.offScreenContext.getImageData(modifiedBox.x, modifiedBox.y + initialBottomY, modifiedBox.width, modifiedBox.height - initialBottomY);
		let addToTop = 0;
		let subtractFromBottom = 0;

		// try to shrink box further by checking for white "damage" or "armor" text color, which appear at the top of item boxes
		// start half-way down the box, b/c we know what we're looking for is towards the top, and we want to get the bottom-most location
		// jump every X pixels, we shouldn't need extreme precision here, just any general idea of where the crop should be
		for (let i=croppedTopImageData.data.length; i>0; i-=(4 * 5)) {
			let r = croppedTopImageData.data[i];
			let g = croppedTopImageData.data[i + 1];
			let b = croppedTopImageData.data[i + 2];

			if (colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || colorIsInRange({ r, g, b }, this.itemRequiredTextColor) || isPixelColored({ r, g, b }) || isPixelBlack({ r, g, b })) {
				let y = Math.floor((i / 4) / croppedTopImageData.width);

				addToTop = y + (this.textLineSpacing * 2);

				if (this.debug) {
					let x1 = (i / 4) % croppedBottomImageData.width;
					let y1 = Math.floor((i / 4) / croppedBottomImageData.width);
					this.context.strokeStyle = 'blue';
					this.context.lineWidth = 2;
					this.context.beginPath();
					this.context.arc(modifiedBox.x + x1, modifiedBox.y + y1, 3, 0, 2 * Math.PI);
					this.context.stroke();
				}

				break;
			}
		}

		// try to shrink box further by checking for the orange (legendary) or white (level required) text color, which appear at the bottom of item boxes
		// start half-way down the box, b/c we know what we're looking for is towards the bottom, and we want to get the top-most location
		// jump every X pixels, we shouldn't need extreme precision here, just any general idea of where the crop should be
		for (let i=0; i<croppedBottomImageData.data.length; i+=(4 * 5)) {
			let r = croppedBottomImageData.data[i];
			let g = croppedBottomImageData.data[i + 1];
			let b = croppedBottomImageData.data[i + 2];

			if (colorIsInRange({ r, g, b }, this.itemLegendaryTextColor) || colorIsInRange({ r, g, b }, this.itemRequiredTextColor) || isPixelColored({ r, g, b }) || isPixelBlack({ r, g, b })) {
				let y = Math.floor((i / 4) / croppedBottomImageData.width);

				subtractFromBottom = modifiedBox.height - (initialBottomY + y) + this.textLineSpacing;

				if (this.debug) {
					let x1 = (i / 4) % croppedBottomImageData.width;
					let y1 = Math.floor((i / 4) / croppedBottomImageData.width);
					this.context.strokeStyle = 'blue';
					this.context.lineWidth = 2;
					this.context.beginPath();
					this.context.arc(modifiedBox.x + x1, modifiedBox.y + initialBottomY + y1, 3, 0, 2 * Math.PI);
					this.context.stroke();
				}

				break;
			}
		}

		modifiedBox.y += addToTop;
		modifiedBox.height -= addToTop;
		modifiedBox.height -= subtractFromBottom;

		return modifiedBox;
	}

	_getStatBoxes(canvas, scanRegionBox) {
		let context = canvas.getContext('2d');
		let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
		let statBoxes = [];
		let startY = 0;
		let endY = 0;
		let dividerPixelsFound = 0;
		// how many units of RGBA pixel data to jump in order to move up 1 text-line
		let textLineHeightJump = imageData.width * 4 * Math.round(this.lineHeight - (this.textLineSpacing / 2));

		// start at the last pixel and work our way up
		for (let i=imageData.data.length - 4; i>=0; i-=4) {
			let r = imageData.data[i];
			let g = imageData.data[i + 1];
			let b = imageData.data[i + 2];

			if (statBoxes.length >= 3 && colorIsInRange({ r, g, b }, this.itemDividerColor)) {
				dividerPixelsFound++;

				// when the divider line is detected, we can complete 1 more stat box and stop trying to find more
				if (dividerPixelsFound > 30) {
					let y = Math.floor((i / 4) / imageData.width);

					startY = y;

					statBoxes.push({
						x: 30,
						y: y + this.textLineSpacing + 4,
						width: canvas.width - 30,
						height: endY - startY - Math.round(this.textLineSpacing / 2) + 2
					});

					if (this.debug) {
						this.context.strokeStyle = 'deeppink';
						this.context.lineWidth = 1;
						this.context.beginPath();
						this.context.rect(scanRegionBox.x + statBoxes[statBoxes.length - 1].x + 2, scanRegionBox.y + statBoxes[statBoxes.length - 1].y, statBoxes[statBoxes.length - 1].width - 2 - 2, statBoxes[statBoxes.length - 1].height);
						this.context.stroke();
					}

					break;
				}
			} else {
				dividerPixelsFound = 0;
			}

			// once the min-max text is detected we can jump up roughly 1 text-line of pixels
			if (colorIsInRange({ r, g, b }, this.itemMinMaxTextColor)) {
				let y = Math.floor((i / 4) / imageData.width);

				// figure out the end Y positions of stat box
				if (!endY) {
					endY = y;

					// since this text-line contains the pixel we're looking for, we can immediately jump up a full text-line next loop iteration
					i -= textLineHeightJump;

					if (this.debug) {
						let x1 = (i / 4) % imageData.width;
						let y1 = Math.floor((i / 4) / imageData.width);
						this.context.strokeStyle = 'green';
						this.context.lineWidth = 2;
						this.context.beginPath();
						this.context.rect(scanRegionBox.x + x1, scanRegionBox.y + y1, 5, 2);
						this.context.stroke();
					}

					continue;
				}

				// we've reached a potentially new stat-box position, however it may be a false positive due to word wrapping of min-max text, and we need to ignore that scenario
				// start by scanning from the left to the right, looking for the proper min-max color, then go up 1 line and do the same from the right to the left, this indicates the text is wrapping
				// TODO: could maybe get a little faster by not looking for the left-to-right case b/c we likely already have it using the current X position
				let foundLeftToRight = this._scanForTextWrapColor(imageData, y + Math.round(this.lineHeight / 2) + Math.round(this.textLineSpacing / 2), 'left-to-right', scanRegionBox);
				let foundRightToLeft = this._scanForTextWrapColor(imageData, y - Math.round(this.lineHeight / 2) + Math.round(this.textLineSpacing / 2), 'right-to-left', scanRegionBox);

				if (foundLeftToRight && foundRightToLeft) {
					// false positive, text is wrapping, need to continue to the next text-line
					i -= textLineHeightJump;

					if (this.debug) {
						let x1 = (i / 4) % imageData.width;
						let y1 = Math.floor((i / 4) / imageData.width);
						this.context.strokeStyle = 'green';
						this.context.lineWidth = 2;
						this.context.beginPath();
						this.context.rect(scanRegionBox.x + x1, scanRegionBox.y + y1, 5, 2);
						this.context.stroke();
					}

					continue;
				}

				// figure out the start Y positions of stat box
				startY = y;

				// offset downwards a bit b/c we're always going to be finding the bottom of every stat box
				statBoxes.push({
					x: 30,
					y: startY + this.textLineSpacing + 2,
					width: canvas.width - 30,
					height: endY - startY - Math.round(this.textLineSpacing / 2) + 2
				});

				if (this.debug) {
					this.context.strokeStyle = 'deeppink';
					this.context.lineWidth = 1;
					this.context.beginPath();
					this.context.rect(scanRegionBox.x + statBoxes[statBoxes.length - 1].x + 2, scanRegionBox.y + statBoxes[statBoxes.length - 1].y, statBoxes[statBoxes.length - 1].width - 2 - 2, statBoxes[statBoxes.length - 1].height);
					this.context.stroke();
				}

				// reset for next box
				endY = 0;
				startY = 0;
			}

			// finish off boxes for top-most one, where there was nothing above it, so we couldn't crop it with the normal technique above
			if (i >= 0 && i <= imageData.width * 4 && endY !== 0) {
				statBoxes.push({
					x: 30,
					y: 0,
					width: canvas.width - 30,
					height: endY + Math.round(this.textLineSpacing / 2) + 2
				});

				if (this.debug) {
					this.context.strokeStyle = 'deeppink';
					this.context.lineWidth = 1;
					this.context.beginPath();
					this.context.rect(scanRegionBox.x + statBoxes[statBoxes.length - 1].x + 2, scanRegionBox.y + statBoxes[statBoxes.length - 1].y, statBoxes[statBoxes.length - 1].width - 2 - 2, statBoxes[statBoxes.length - 1].height);
					this.context.stroke();
				}

				break;
			}
		}

		return statBoxes.reverse();
	}

	_scanForTextWrapColor(imageData, y, direction, scanRegionBox) {
		if (direction === 'left-to-right') {
			for (let i=imageData.width * 4 * y; i<=(imageData.width * 4 * y) + Math.round(imageData.width * 4 / 3); i+=4) {
				let r = imageData.data[i];
				let g = imageData.data[i + 1];
				let b = imageData.data[i + 2];

				if (colorIsInRange({ r, g, b }, this.itemMinMaxTextColor)) {
					if (this.debug) {
						let x1 = (i / 4) % imageData.width;
						let y1 = Math.floor((i / 4) / imageData.width);
						this.context.strokeStyle = 'purple';
						this.context.lineWidth = 2;
						this.context.beginPath();
						this.context.arc(scanRegionBox.x + x1, scanRegionBox.y + y1, 3, 0, 2 * Math.PI);
						this.context.stroke();
					}
					return true;
				}
			}
		} else if (direction === 'right-to-left') {
			for (let i=(imageData.width * 4 * y) + (imageData.width * 4); i>=(imageData.width * 4 * y) + Math.round(imageData.width * 4) - Math.round(imageData.width * 4 / 3); i-=4) {
				let r = imageData.data[i];
				let g = imageData.data[i + 1];
				let b = imageData.data[i + 2];

				if (colorIsInRange({ r, g, b }, this.itemMinMaxTextColor)) {
					if (this.debug) {
						let x1 = (i / 4) % imageData.width;
						let y1 = Math.floor((i / 4) / imageData.width);
						this.context.strokeStyle = 'pink';
						this.context.lineWidth = 2;
						this.context.beginPath();
						this.context.arc(scanRegionBox.x + x1, scanRegionBox.y + y1, 3, 0, 2 * Math.PI);
						this.context.stroke();
					}
					return true;
				}
			}
		}

		return false;
	}

	// TODO: if an item sits nicely underneath the "STASH" tab this can throw a false positive and think it's looking at an equipped item
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
			// TODO: this is a bit redundant now that the bullet points and stats are being manually discovered and stripped into single pieces
			.split(/\n(?=[©@%+o0£]?\s)|\n(?=[O0])/i)
			// map to a nice object with some placeholders that get filled out later
			.map((paragraph) => {
				return {
					text: paragraph.replace('\n', ' ').trim(),
					textCleaned: '',
					bbox: { x0: 10000, y0: 10000, x1: 0, y1: 0 },
					lines: []
				};
			});

		// figure out which OCR line goes with which paragraph
		for (let line of results.lines) {
			let paragraph = paragraphs.find((p) => {
				return p.text.indexOf(line.text.replace('\n', ' ').trim()) >= 0;
			});

			// construct clean "text" from confident words
			for (let word of line.words) {
				// unfortunately the confidence on a line isn't so reliable for some reason, and we're really just trying to remove 1 letter noise words
				let manualWordConfidence = word.symbols.reduce((previousValue, currentValue) => previousValue + currentValue.confidence, 0) / word.symbols.length;

				if (manualWordConfidence > 40) {
					paragraph.textCleaned += word.text + ' ';
				}
			}

			paragraph.textCleaned.trim();
			paragraph.bbox.x0 = Math.min(paragraph.bbox.x0, line.bbox.x0);
			paragraph.bbox.y0 = Math.min(paragraph.bbox.y0, line.bbox.y0);
			paragraph.bbox.x1 = Math.max(paragraph.bbox.x1, line.bbox.x1);
			paragraph.bbox.y1 = Math.max(paragraph.bbox.y1, line.bbox.y1);
			paragraph.lines.push(line);
		}

		// clean up the OCR results
		for (let paragraph of paragraphs) {
			// start by combining lines into 1 line and removing the single character of junk that ultimately is just a bullet character
			let text = paragraph.textCleaned.replace(/\n/gi, ' ').replace(/^.\s/gi, '');
			let matchString = this.matchData.map((data) => data.name).join('|');
			let textRegex = new RegExp(`.*?(\\d+\\.?\\d?)[%]?\\s(.*?)\\s[+]?\\[?(\\d+\\.?\\d?)\\s?-?\\s?(\\d+\\.?\\d?)?\\]?`, 'i');

			let [, value, statName, min, max ] = text.match(textRegex) || [];
			let matchedStatName = statName?.match(new RegExp(`${matchString}`, 'i'))?.[0];

			// cast all the number values as actual numbers, so we can do proper math and checks
			value = +value || 0;
			min = +min || 0;
			// in the case of only 1 value in brackets [ min/max ], we'll assume min can also be max if no max is present
			max = +max || +min || 0;

			// if "value" is larger than max, likely OCR misread a bracket as a number
			if (value > max) {
				console.warn(`There may have been an OCR issue when reading "${value}" which is not between [ "${min}" - "${max}" ].  First digit got stripped in the hopes that it was just a bracket [] misread.`);
				value = parseFloat(value.toString().slice(1));
			}

			// leaving this here b/c it helps quickly debugger squirrelly OCR reads
			console.log((matchedStatName) ? '⭐' : '🚫', value, statName, min, max, `"${text}"`);

			if (matchedStatName) {
				let percentageToMax = 100 * (value - min) / (max - min);
				let matchPercentage = this.matchData.find((statItem) => {
					return statItem.name.toLowerCase() === matchedStatName.toLowerCase();
				})?.percentage;

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
	}
}

let overlay = new Overlay();
await overlay.initialize();
overlay.activate();
