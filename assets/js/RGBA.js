
export default class RGBA {
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
