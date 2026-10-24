# RigStash

All your PC games in one place. RigStash finds the games installed on your computer and lets you launch them from a single, clean library.

## Download

**[Download RigStash for Windows](https://github.com/canthed/RigStash-Gamevault/releases/latest/download/RigStash-Setup.exe)**

Run the installer and RigStash appears in your Start menu. You don't need to install anything else.

### "Windows protected your PC" warning

Windows may show this warning because the installer isn't code-signed. Code-signing certificates cost money, and RigStash is a free project. To continue, click **More info**, then **Run anyway**.

The full source code is in this repository, so you can read it yourself or build the app from it.

## Features

- **Automatic detection:** finds installed games from Steam (including extra library folders), Epic Games and GOG.
- **Manual add:** add any game by choosing its `.exe` file. You can also enter a Steam App ID to get the cover picture and launch through Steam.
- **Cover art:** shows game covers for your whole library, including Epic and GOG games.
- **One-click launch:** click a game to start it.
- **Favorites and filters:** bookmark games, search by name, and filter by platform.
- **Your PC's name** appears in the bottom-left corner of the sidebar.

## How it works

- RigStash reads the game lists that Steam, Epic Games and GOG already keep on your PC. It doesn't change them.
- Your favorites and manually added games are saved in a small file on your own computer.
- It needs an internet connection to load cover pictures. It requests them from Steam's store and image servers, and from Epic's image servers for Epic games.
- There are no accounts and no ads. RigStash doesn't send your game list anywhere.

## Run from source

You need [Node.js](https://nodejs.org) installed.

```bash
npm install
npm start
```

To build the installer yourself:

```bash
npm run dist
```

The installer is created in the `dist` folder.

## Supported platforms

| Platform | Auto-detect | Manual add |
| --- | --- | --- |
| Windows | Steam, Epic Games, GOG | Yes |
| macOS / Linux | Steam | Yes |

Windows is the main supported platform.

## Contact

Made by **@canthed** (TikTok). Built with the help of Claude, an AI assistant made by Anthropic.

Found a bug or want a feature? Open an [issue](https://github.com/canthed/RigStash-Gamevault/issues).

## Disclaimer

RigStash is an independent project. It isn't affiliated with or endorsed by Valve, Epic Games, GOG or any game publisher. Steam, Epic Games, GOG and all game names, logos and cover art are trademarks or property of their respective owners.
