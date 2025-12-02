# Tide Checker Chrome Extension

A lightweight Chrome extension that shows current marine conditions for a user-selected location.

## Features

- Search and select a location by latitude/longitude
- View marine data (wave height, wave direction)
- Automatically saves your location
- Simple, clean interface

## Installation

1. Add icon files to the `icons/` folder:
   - `icon16.png` (16x16 pixels)
   - `icon48.png` (48x48 pixels)
   - `icon128.png` (128x128 pixels)

2. Open Chrome and navigate to `chrome://extensions/`

3. Enable "Developer mode" (toggle in top-right corner)

4. Click "Load unpacked"

5. Select the `tide-checker-extension` folder

## Usage

1. Click the extension icon in your browser toolbar
2. Enter latitude and longitude coordinates
3. Click "Save Location"
4. View the marine data for your location

## API

Currently uses the free Open-Meteo Marine API (no API key required).

For actual tide times, consider integrating:
- WorldTides API
- NOAA Tides API (USA only)

## Files Structure

```
tide-checker-extension/
├── manifest.json       # Extension configuration
├── popup.html          # Extension popup UI
├── popup.css           # Styling
├── popup.js            # Logic and API integration
├── icons/              # Extension icons (you need to add these)
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # This file
```

## Future Enhancements

- Actual tide times (high/low tide predictions)
- Named location search (city/beach names)
- Multiple saved locations
- Tide graphs and visualizations
- Notifications for tide changes
