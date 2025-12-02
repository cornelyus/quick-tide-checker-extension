// DOM Elements
const locationSetup = document.getElementById('location-setup');
const tideInfo = document.getElementById('tide-info');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const saveLocationBtn = document.getElementById('save-location');
const changeLocationBtn = document.getElementById('change-location');
const locationDisplay = document.getElementById('location-name');
const tideDataDiv = document.getElementById('tide-data');
const errorMessage = document.getElementById('error-message');

// Initialize the extension
init();

async function init() {
  try {
    const savedLocation = await chrome.storage.sync.get(['latitude', 'longitude']);

    if (savedLocation.latitude && savedLocation.longitude) {
      // Location exists, show tide info
      showTideInfo(savedLocation.latitude, savedLocation.longitude);
    } else {
      // No location saved, show setup
      showLocationSetup();
    }
  } catch (error) {
    showError('Failed to load saved location');
  }
}

function showLocationSetup() {
  locationSetup.classList.remove('hidden');
  tideInfo.classList.add('hidden');
  errorMessage.classList.add('hidden');
}

function showTideInfo(lat, lon) {
  locationSetup.classList.add('hidden');
  tideInfo.classList.remove('hidden');
  errorMessage.classList.add('hidden');

  locationDisplay.textContent = `Location: ${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  fetchTideData(lat, lon);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

// Save location handler
saveLocationBtn.addEventListener('click', async () => {
  const lat = parseFloat(latitudeInput.value);
  const lon = parseFloat(longitudeInput.value);

  if (isNaN(lat) || isNaN(lon)) {
    showError('Please enter valid latitude and longitude');
    return;
  }

  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    showError('Latitude must be between -90 and 90, longitude between -180 and 180');
    return;
  }

  try {
    await chrome.storage.sync.set({ latitude: lat, longitude: lon });
    showTideInfo(lat, lon);
  } catch (error) {
    showError('Failed to save location');
  }
});

// Change location handler
changeLocationBtn.addEventListener('click', () => {
  showLocationSetup();
});

// Fetch tide data from Open-Meteo Marine API
async function fetchTideData(lat, lon) {
  tideDataDiv.innerHTML = '<div class="loading">Loading tide data...</div>';

  try {
    // Open-Meteo Marine API - free, no API key required
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&daily=wave_height_max,wave_direction_dominant&timezone=auto`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Failed to fetch tide data');
    }

    const data = await response.json();
    displayTideData(data);
  } catch (error) {
    tideDataDiv.innerHTML = '<div class="error">Failed to load tide data. Please check your internet connection and try again.</div>';
  }
}

function displayTideData(data) {
  // Note: Open-Meteo Marine API provides wave data, not specific tide times
  // For MVP, we'll display available marine data
  // For actual tide times, you'd need WorldTides or NOAA API

  if (!data.daily) {
    tideDataDiv.innerHTML = '<div class="error">No marine data available for this location</div>';
    return;
  }

  const today = data.daily.time[0];
  const waveHeight = data.daily.wave_height_max[0];
  const waveDirection = data.daily.wave_direction_dominant[0];

  const html = `
    <div class="tide-item">
      <div class="tide-label">Date</div>
      <div class="tide-value">${today}</div>
    </div>
    <div class="tide-item high">
      <div class="tide-label">Max Wave Height</div>
      <div class="tide-value">${waveHeight ? waveHeight.toFixed(2) + ' m' : 'N/A'}</div>
    </div>
    <div class="tide-item low">
      <div class="tide-label">Wave Direction</div>
      <div class="tide-value">${waveDirection ? waveDirection + '°' : 'N/A'}</div>
    </div>
    <div style="margin-top: 15px; padding: 10px; background: #fff3cd; border-radius: 5px; font-size: 12px; color: #856404;">
      <strong>Note:</strong> This MVP uses Open-Meteo Marine API (wave data). For actual tide times, consider integrating WorldTides or NOAA API in future versions.
    </div>
  `;

  tideDataDiv.innerHTML = html;
}
