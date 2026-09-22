# EVConnectNotifier

Get a desktop or Chrome notification when a connector at one of your EV Connect charging locations becomes available. EVConnectNotifier runs locally, checks quietly in the background, and avoids repeat alerts for connectors that were already free.

> Independent community project. Not affiliated with, endorsed by, or sponsored by EV Connect or Schneider Electric. You need your own EV Connect driver account.

## Features

- Monitors the charging locations available to your EV Connect driver account
- Shows free connectors by station and QR code
- Checks every 5, 15, or 30 minutes
- Supports a paused mode that keeps the session ready without checking availability
- Alerts only when a connector changes to available
- Automatically rotates the session refresh token
- Available as a Chrome extension or an Electron tray app

## Install the Chrome extension

1. Download `charger-availability-notifier-1.0.0.zip` from [Release 1.0](https://github.com/contactmrshalin/EVConnectNotifier/releases/tag/v1.0.0).
2. Unzip the download.
3. Open `chrome://extensions` in Chrome.
4. Enable **Developer mode**.
5. Select **Load unpacked** and choose the unzipped folder.
6. Open the extension settings, sign in, and choose a polling interval.

Chrome displays the available connector count on the extension badge. Select **Refresh now** in the popup whenever you want an immediate check.

## Install the desktop app

1. Download the macOS DMG or ZIP from [Release 1.0](https://github.com/contactmrshalin/EVConnectNotifier/releases/tag/v1.0.0).
2. Move **EV Connect Notifier** to Applications.
3. Open the app and use the tray icon to open **Settings**.
4. Sign in and choose how often the app should check.

The macOS 1.0 build is unsigned. On first launch, right-click the app and choose **Open**, then confirm. You can also remove the quarantine attribute after moving it to Applications:

```sh
xattr -dr com.apple.quarantine "/Applications/EV Connect Notifier.app"
```

Windows and Linux builds can be created from source with the commands below.

## Privacy

EVConnectNotifier does not include analytics, advertising, telemetry, or a project-operated server. It communicates with the EV Connect driver API only to sign in and check your charging locations.

| Data | What happens |
| --- | --- |
| Password | Used for the sign-in request and immediately discarded. It is never written to disk by either app. |
| Session tokens | Stored locally so monitoring can continue. Electron encrypts them with the operating system keystore. Chrome keeps them in the extension's local browser-profile storage, which is not encrypted by this extension. |
| Email | Stored locally to identify the signed-in account and prefill the sign-in field. |
| Charging locations | Read from your EV Connect account during each check. The app does not upload or maintain a separate copy of your favorites. |
| Availability state | Kept locally to detect when a connector changes from unavailable to available. |

No credentials or account data are sent to the project author. As with any local client, anyone with access to your unlocked computer or browser profile may be able to access locally stored data.

## Using the notifier

After signing in, the app reads the locations associated with your EV Connect account. A connector counts as available only when both its connector status and service status are `AVAILABLE`.

| Setting | Purpose |
| --- | --- |
| Check availability | Poll every 5, 15, or 30 minutes, or pause automatic checks. |
| Play a sound | Adds an audible cue to Electron notifications. |
| Start at login | Starts the Electron tray app when you sign in to the computer. |
| Send test notification | Confirms that operating-system or Chrome notifications are enabled. |
| Advanced connection settings | Allows manual token or endpoint configuration when troubleshooting. |

Paused mode stops availability checks and notifications but refreshes the session periodically. Manual **Refresh now** checks still work.

## Run from source

Requirements: Node.js 18 or newer and npm.

```sh
git clone https://github.com/contactmrshalin/EVConnectNotifier.git
cd EVConnectNotifier
npm install
npm start
```

Build distributable packages:

```sh
npm run dist:extension
npm run dist:mac
npm run dist:win
```

Generated files are written to `dist/`.

## Troubleshooting

| Message or issue | Resolution |
| --- | --- |
| Refresh token rejected | The token was already used or the account signed out. Sign in again. |
| Session expired (401/403) | Open Settings and sign in to create a new session. |
| Not signed in | Open Settings and connect your account. |
| No notifications | Use **Send test notification**, then check Chrome or operating-system notification permissions. |
| No locations shown | Confirm that charging locations are visible in the EV Connect driver portal for the same account. |

## Project structure

```text
extension/   Chrome Manifest V3 extension
renderer/    Electron settings window
src/         Electron tray app, API client, scanner, and local store
scripts/     Icon generation and extension packaging
```

The project uses the EV Connect driver portal's private API, which may change without notice. Review the service terms that apply to your account before distributing or operating this client.
