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
    // Open-Meteo Marine API - using sea_level_height_msl for REAL tide data
    // Using GMT0 timezone to get consistent ISO timestamps with timezone info
    const url = `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}&hourly=wave_height,sea_level_height_msl&timezone=GMT&forecast_days=2`;

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
  if (!data.hourly || !data.hourly.time || !data.hourly.sea_level_height_msl) {
    tideDataDiv.innerHTML = '<div class="error">No tide data available for this location</div>';
    return;
  }

  const times = data.hourly.time;
  const seaLevels = data.hourly.sea_level_height_msl;

  // Debug: Log data
  console.log('Total data points:', seaLevels.length);
  console.log('First 12 hours sea levels:', seaLevels.slice(0, 12));
  console.log('First time string:', times[0]);

  // Find current time index
  const now = new Date();
  let currentIndex = 0;
  for (let i = 0; i < times.length; i++) {
    const timeDate = new Date(times[i]);
    if (timeDate <= now) {
      currentIndex = i;
    } else {
      break;
    }
  }

  console.log('Current index:', currentIndex);

  // Determine if tide is rising or falling
  const currentHeight = seaLevels[currentIndex];
  const nextHeight = seaLevels[currentIndex + 1] || currentHeight;

  const isRising = nextHeight > currentHeight;
  const tideStatus = isRising ? '📈 Rising' : '📉 Falling';

  // Find precise tide times using quadratic interpolation
  const preciseTides = getPreciseTides({ sea_level_height_msl: seaLevels, time: times });

  console.log('Precise tides:', preciseTides);

  // Find next high and low from current time
  const nextHigh = preciseTides.find(t => t.type === 'HIGH' && new Date(t.time) > now);
  const nextLow = preciseTides.find(t => t.type === 'LOW' && new Date(t.time) > now);

  console.log('Next high:', nextHigh);
  console.log('Next low:', nextLow);

  let html = `
    <div class="tide-item current">
      <div class="tide-label">Current Tide</div>
      <div class="tide-value">${tideStatus}</div>
      <div class="tide-time">Sea Level: ${currentHeight ? currentHeight.toFixed(2) + ' m' : 'N/A'}</div>
    </div>
  `;

  if (nextHigh) {
    const highTime = new Date(nextHigh.time);
    const timeUntil = getTimeUntil(highTime);
    const formattedTime = highTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    html += `
      <div class="tide-item high">
        <div class="tide-label">Next High Tide</div>
        <div class="tide-value">${timeUntil}</div>
        <div class="tide-time">at ${formattedTime} (${nextHigh.height} m)</div>
      </div>
    `;
  }

  if (nextLow) {
    const lowTime = new Date(nextLow.time);
    const timeUntil = getTimeUntil(lowTime);
    const formattedTime = lowTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    html += `
      <div class="tide-item low">
        <div class="tide-label">Next Low Tide</div>
        <div class="tide-value">${timeUntil}</div>
        <div class="tide-time">at ${formattedTime} (${nextLow.height} m)</div>
      </div>
    `;
  }

  tideDataDiv.innerHTML = html;
}

// Function to find precise high/low tides using quadratic interpolation
function getPreciseTides(hourlyData) {
  const seaLevels = hourlyData.sea_level_height_msl;
  const times = hourlyData.time;
  const tides = [];

  for (let i = 1; i < seaLevels.length - 1; i++) {
    const y1 = seaLevels[i - 1]; // Previous hour
    const y2 = seaLevels[i];     // Current hour (The peak candidate)
    const y3 = seaLevels[i + 1]; // Next hour

    // Skip null/undefined values
    if (y1 == null || y2 == null || y3 == null) continue;

    // 1. Identify a Peak (High Tide) or Trough (Low Tide)
    const isHigh = y2 > y1 && y2 > y3;
    const isLow = y2 < y1 && y2 < y3;

    if (isHigh || isLow) {
      // 2. Apply Quadratic Interpolation to find the exact peak offset
      // Formula: offset = (y1 - y3) / (2 * (y1 - 2*y2 + y3))
      // This gives us the fraction of an hour (-0.5 to +0.5) where the true peak lies
      const divisor = 2 * (y1 - 2 * y2 + y3);
      let offset = 0;

      if (divisor !== 0) {
        offset = (y1 - y3) / divisor;
      }

      // 3. Calculate the exact time
      // The 'time' array is usually ISO strings. We treat 'i' as the hour index.
      const baseTime = new Date(times[i]).getTime();
      const offsetMilliseconds = offset * 60 * 60 * 1000; // Convert fraction of hour to ms
      const preciseTime = new Date(baseTime + offsetMilliseconds);

      // 4. Calculate precise height (optional, fits parabola to peak)
      // Height = y2 - 0.25 * (y1 - y3) * offset
      const preciseHeight = y2 - 0.25 * (y1 - y3) * offset;

      tides.push({
        type: isHigh ? 'HIGH' : 'LOW',
        time: preciseTime.toISOString(), // Precise minute!
        height: preciseHeight.toFixed(2)
      });
    }
  }
  return tides;
}

function getTimeUntil(futureTime) {
  const now = new Date();
  const diff = futureTime - now;

  if (diff < 0) return 'Now';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours === 0) {
    return `in ${minutes} min`;
  } else if (hours === 1) {
    return `in 1 hour ${minutes} min`;
  } else {
    return `in ${hours} hours ${minutes} min`;
  }
}
