const debug = process.argv.includes('--inspect') || process.argv.includes('--inspect-brk');
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, MenuItem } = require('electron');

if (process.env.INIT_CWD) {
	appRoot.setPath(process.env.INIT_CWD);
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = true;

const { createWorker, createScheduler } = require('tesseract.js');


class ElectronOverlay {
	constructor() {
		this.controlWindow = null;
		this.overlayWindow = null;
		this.matchDataFile = path.join(__dirname, 'data/data.json');
		this.gameInputSource = null;
		this.matchData = [];

		this.initialize().catch(console.error);
		this.activate();
	}

	async initialize() {
		if (!fs.existsSync(this.matchDataFile)) {
			fs.writeFileSync(this.matchDataFile, JSON.stringify(this.matchData, null, '\t'));
		}

		this.matchData = JSON.parse(fs.readFileSync(this.matchDataFile));

		await this.createScheduler();
		this.createControlWindow().catch(console.error);
	}

	activate() {
		// prompt user which input source they'd like to use,
		ipcMain.handle('query-input-source', async (event) => {
			let gameSource;
			let inputSources = await desktopCapturer.getSources({
				types: ['window', 'screen'],
				fetchWindowIcons: true,
			});

			// in production, we can clean up the results a bit with some assumptions on what they're looking for (video game title)
			if (!debug) {
				inputSources = inputSources.filter((source) => {
					return source.name.match(/^Diablo IV/g);
				});

				if (!inputSources.length) {
					inputSources = inputSources.filter((source) => {
						return source.id.search('screen') >= 0;
					});
				}
			}

			if (inputSources.length === 1) {
				gameSource = inputSources[0];
			} else {
				gameSource = await new Promise((resolve) => {
					const videoOptionsMenu = Menu.buildFromTemplate(
						inputSources.map((source) => {
							return new MenuItem({
								label: source.name,
								icon: source.appIcon?.resize({
									width: 20
								}) || source.thumbnail?.resize({
									width: 20
								}),
								click: () => {
									resolve(source);
								}
							});
						})
					);

					videoOptionsMenu.popup({
						window: BrowserWindow.fromWebContents(event.sender),
						callback: () => {
							resolve();
						},
					});
				});

				if (!gameSource) {
					return;
				}
			}

			this.gameInputSource = gameSource;
			this.createOverlayWindow().catch(console.error);

			return gameSource;
		});

		ipcMain.handle('get-debug-flag', () => {
			return debug;
		});

		ipcMain.handle('get-input-source', async () => {
			return this.gameInputSource;
		});

		ipcMain.handle('get-update-data', () => {
			return this.matchData;
		});

		ipcMain.handle('ocr-process', async (event, image) => {
			const { data } = await this.scheduler.addJob('recognize', image);
			return data;
		});

		ipcMain.on('stop-scanning', () => {
			this.overlayWindow?.close();
		});

		ipcMain.on('input-data', (event, data) => {
			this.matchData = data;
			fs.writeFileSync(this.matchDataFile, JSON.stringify(this.matchData, null, '\t'))
			this.overlayWindow?.send('update-data', this.matchData);
		});
	}

	createScheduler() {
		let promiseWorkers = [];

		// https://github.com/bradparks/tesseract.js___javascript_based_ocr/blob/master/docs/tesseract_parameters.md
		let tesseractSettings = {
			// NOTE: technically parenthesis can happen in stats when something like "(Barbarian Only)" appears, but it's easier to blacklist it all together for better accuracy with numbered stats
			tessedit_char_blacklist: ';{}/\\_=!`‘~<>|()',
			// max_permuter_attempts: 1,
			// permute_only_top: 1,
			// segsearch_max_futile_classifications: 1,
			// tessedit_dump_choices: 1,
			// tessedit_single_match: 1,
			// tessedit_truncate_wordchoice_log: 1,
			// tessedit_char_whitelist: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ .,-+©*[]()%:\n',
		};

		this.scheduler = createScheduler();

		// create 4 workers b/c I'm going to try and grab 1 item box and split the 4 stats boxes up manually
		for (let i=0; i<4; i++) {
			promiseWorkers.push(createWorker().then(async (worker) => {
				// NOTE: These have to happen one after another
				await worker.loadLanguage('eng');
				await worker.initialize('eng');
				await worker.setParameters(tesseractSettings);

				this.scheduler.addWorker(worker);
			}));
		}

		return Promise.all(promiseWorkers);
	}

	async createControlWindow() {
		this.controlWindow = new BrowserWindow({
			title: 'Diablo 4 Overlay',
			// icon: path.join(__dirname, 'assets/icon.ico'),
			width: 800,
			height: 800,
			webPreferences: {
				nodeIntegration: true,
				contextIsolation: false,
			}
		});

		this.controlWindow.on('closed', () => {
			this.controlWindow = null;
			this.overlayWindow?.close();
		});

		await this.controlWindow.loadURL(path.join('file://', __dirname, 'assets/control-window/index.html'));

		// set up different environments for ease of development
		if (debug) {
			this.controlWindow.openDevTools();
		}
	}

	async createOverlayWindow() {
		this.overlayWindow = new BrowserWindow({
			// icon: path.join(__dirname, 'assets/icon.ico'),
			width: 1900,
			height: 1000,
			transparent: true,
			skipTaskbar: !debug,
			useContentSize: !debug,
			alwaysOnTop: !debug,
			kiosk: !debug,
			resizable: debug,
			movable: debug,
			frame: debug,
			webPreferences: {
				backgroundThrottling: false,
				nodeIntegration: true,
				contextIsolation: false,
			}
		});

		this.overlayWindow.on('closed', () => {
			this.overlayWindow = null;
		});

		await this.overlayWindow.loadURL(path.join('file://', __dirname, 'assets/overlay-window/index.html'));

		// set up different environments for ease of development
		if (debug) {
			this.overlayWindow.openDevTools();
		} else {
			this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
			this.overlayWindow.setIgnoreMouseEvents(true);
		}

		// this.overlayWindow.setAlwaysOnTop(true, 'screen-saver');
		// this.overlayWindow.setIgnoreMouseEvents(true);
	}
}

app.on('ready', () => {
	let overlay = new ElectronOverlay();

	app.on('window-all-closed', async function () {
		await overlay.scheduler.terminate();
		app.quit();
	});
});
