
const $ = require('jquery');

import RGBA from './RGBA.js';

/**
 *
 * @param {HTMLCanvasElement} originalCanvas
 * @param {Object} crop
 * @param {Number} [crop.x]
 * @param {Number} [crop.y]
 * @param {Number} [crop.width]
 * @param {Number} [crop.height]
 * @returns {{canvas: HTMLCanvasElement, context: CanvasRenderingContext2D}}
 */
export function canvasClipped(originalCanvas, { x = 0, y = 0, width = originalCanvas.width, height = originalCanvas.height }) {
	let canvas = $('<canvas>')[0];
	let context = canvas.getContext('2d');

	canvas.width = width;
	canvas.height = height;

	context.drawImage(originalCanvas, x, y, width, height, 0, 0, width, height);

	return { canvas, context };
}


/**
 * Clean up the canvas, filtering out
 * @param {HTMLCanvasElement} canvas
 * @param {Object} color
 * @private
 */
export function cleanCanvas(canvas, color) {
	let context = canvas.getContext('2d');
	let imageData = context.getImageData(0, 0, canvas.width, canvas.height);

	for (let i=0; i<imageData.data.length; i+=4) {
		// let hsl = RGBA.RGBToHSL(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]);

		// grayscale text and convert all non-text to black pixels for easier readability
		if (!colorIsInRange({ r: imageData.data[i], g: imageData.data[i + 1], b: imageData.data[i + 2] }, color)) {
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


export function isPixelColored(color) {
	return Math.abs(color.r - color.b) > 100 || Math.abs(color.r - color.g) > 100 || Math.abs(color.g - color.b) > 100;
}

export function isPixelBlack(color) {
	return color.r <= 1 && color.g <= 1 && color.b <= 1;
}

export function colorIsInRange(color, range) {
	return color.r >= range.r.min && color.r <= range.r.max && color.g >= range.g.min && color.g <= range.g.max && color.b >= range.b.min && color.b <= range.b.max;
}

export function colorIsInRangeHSL(color, range) {
	let hsl = RGBA.RGBToHSL(color.r, color.g, color.b);
	return hsl.h >= range.h.min && hsl.h <= range.h.max && hsl.l >= range.l.min && hsl.l <= range.l.max;
}

export function pointIsInBox(point, box, boxPadding) {
	let extraPadding = (boxPadding * 1.5);
	return point.x >= box.x - extraPadding && point.x <= box.x - extraPadding + box.width + (extraPadding * 2) && point.y >= box.y - extraPadding && point.y <= box.y - extraPadding + box.height + (extraPadding * 2);
}

export function boxIsCollidingBox(box1, box2) {
	return box1.x < box2.x + box2.width &&
		box1.x + box1.width > box2.x &&
		box1.y < box2.y + box2.height &&
		box1.y + box1.height > box2.y;
}
