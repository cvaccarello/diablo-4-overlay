const debug = process.argv.includes('--inspect') || process.argv.includes('--inspect-brk');
const fs = require('fs');
const path = require('path');
const appRoot = require('app-root-path');
const { app, BrowserWindow, ipcMain, desktopCapturer, Menu, MenuItem } = require('electron');

if (process.env.INIT_CWD) {
	appRoot.setPath(process.env.INIT_CWD);
}

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = true;

class ElectronOverlay {
	constructor() {
		this.controlWindow = null;
		this.overlayWindow = null;
		this.matchDataFile = path.join(__dirname, 'data/data.json');
		this.matchData = [];

		this.initialize();
		this.activate();
	}

	initialize() {
		if (!fs.existsSync(this.matchDataFile)) {
			fs.writeFileSync(this.matchDataFile, JSON.stringify(this.matchData, null, '\t'));
		}

		this.matchData = JSON.parse(fs.readFileSync(this.matchDataFile));

		this.createControlWindow().catch(() => {});
	}

	activate() {
		ipcMain.handle('get-input-source', async (event) => {
			let inputSources = await desktopCapturer.getSources({
				types: ['window', 'screen']
			});

			let inputSource = await new Promise((resolve) => {
				const videoOptionsMenu = Menu.buildFromTemplate(
					inputSources.map(source => {
						return new MenuItem({
							label: source.name,
							click: () => {
								resolve(source);
							}
						});
					})
				);

				videoOptionsMenu.popup({ window: BrowserWindow.fromWebContents(event.sender) });
			});

			this.createOverlayWindow().then(() => {
				this.overlayWindow.send('set-input-source', inputSource);
				this.overlayWindow.send('update-data', this.matchData);
			}).catch(() => {});

			return inputSource;
		});

		ipcMain.on('stop-scanning', async (event) => {
			this.overlayWindow?.close();
		});

		ipcMain.on('get-update-data', () => {
			this.controlWindow?.send('update-data', this.matchData);
			this.overlayWindow?.send('update-data', this.matchData);
		});

		ipcMain.on('input-data', (event, data) => {
			this.matchData = data;
			fs.writeFileSync(this.matchDataFile, JSON.stringify(this.matchData, null, '\t'))
			this.overlayWindow?.send('update-data', this.matchData);
		});
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
			this.overlayWindow.close();
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
			closable: debug,
			useContentSize: !debug,
			alwaysOnTop: !debug,
			kiosk: !debug,
			resizable: debug,
			movable: debug,
			frame: false,
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

app.on('window-all-closed', function () {
	app.quit();
});

app.on('ready', () => {
	new ElectronOverlay();
});
