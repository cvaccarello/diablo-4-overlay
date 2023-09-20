
const $ = require('jquery');
const { ipcRenderer } = require('electron');

class Control {
	constructor() {
		this.video = $('video')[0];
	}

	initialize() {
		console.log(ipcRenderer);
		ipcRenderer.send('get-update-data');
	}

	activate() {
		ipcRenderer.on('update-data', (event, data) => {
			let $container = $('.check-container');
			let $parent = $container.parent();
			let $box = $container.first().clone();

			$parent.empty();
			$parent.append($box);

			for (let searchBlock of data) {
				let $box = $container.first().clone();

				for (let [name, value] of Object.entries(searchBlock)) {
					$box.find(`input[name="${name}"]`).val(value);
				}

				$parent.append($box);
			}
		});

		$(document).on('click', '.a-start', () => {
			this.getVideoSource().catch(console.error);
		});

		$(document).on('click', '.a-stop', () => {
			ipcRenderer.send('stop-scanning');
		});

		$(document).on('click', '.a-add', () => {
			let $container = $('.check-container');
			let $parent = $container.parent();
			let $box = $container.first().clone();

			$box.find('input').val('');
			$parent.prepend($box);
		});

		$(document).on('click', '.a-delete', (e) => {
			let $this = $(e.currentTarget);
			let $container = $this.closest('.check-container');
			let $parent = $container.parent();

			if ($parent.children().length > 1) {
				$this.closest('.check-container').remove();
			}

			this.serializeAndSend();
		});

		$(document).on('click', '.a-close', () => {

		});

		$(document).on('input', '.input-range, .input-percentage', (e) => {
			let $this = $(e.currentTarget);
			let $container = $this.closest('.check-container');
			let value = $this.val();

			if (value > 100) {
				value = 100;
			} else if (value < 0) {
				value = 0;
			}

			$container.find('.input-range, .input-percentage').val(value);
		});

		$(document).on('input', 'input', (e) => {
			let $this = $(e.currentTarget);

			this.serializeAndSend();
		});
	}

	// Get the available video sources
	async getVideoSource() {
		await this.setSource(await ipcRenderer.invoke('get-input-source'));
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

		// Preview the source in a video element
		this.video.srcObject = await navigator.mediaDevices.getUserMedia(constraints);
		this.video.play();
	}

	serializeAndSend() {
		let data = [];

		$('.check-container').each((i, el) => {
			let inputs = $(el).serializeArray();

			// skip empty stuff
			if (!inputs[0].value) {
				return;
			}

			data.push({
				[inputs[0].name]: inputs[0].value,
				[inputs[1].name]: +inputs[1].value,
				[inputs[2].name]: +inputs[2].value,
			});
		});

		ipcRenderer.send('input-data', data);
	}
}

$(() => {
	let control = new Control();
	control.initialize();
	control.activate();
});
