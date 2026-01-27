// DOM Elements
const locationSetup = document.getElementById('location-setup');
const tideInfo = document.getElementById('tide-info');
const locationSearchInput = document.getElementById('location-search');
const searchResultsDiv = document.getElementById('search-results');
const toggleManualBtn = document.getElementById('toggle-manual');
const manualInputsDiv = document.getElementById('manual-inputs');
const latitudeInput = document.getElementById('latitude');
const longitudeInput = document.getElementById('longitude');
const saveLocationBtn = document.getElementById('save-location');
const changeLocationBtn = document.getElementById('change-location');
const locationDisplay = document.getElementById('location-name');
const tideDataDiv = document.getElementById('tide-data');
const errorMessage = document.getElementById('error-message');

// Debug flag - set to true to enable detailed diagnostic logging
const DEBUG_MODE = false;

// Tidal physics constants
const TIDAL_CONSTANTS = {
  MIN_TIDE_SEPARATION_HOURS: 4.5,  // Minimum hours between tides (conservative estimate)
  MIN_TIDE_SEPARATION_MS: 4.5 * 60 * 60 * 1000  // In milliseconds
};

// State
let selectedLocation = null;
let searchTimeout = null;

// Initialize the extension
init();

async function init() {
  // Set time-based theme
  setTimeBasedTheme();

  try {
    const savedLocation = await chrome.storage.sync.get(['latitude', 'longitude', 'locationName']);

    if (savedLocation.latitude && savedLocation.longitude) {
      // Location exists, show tide info
      showTideInfo(savedLocation.latitude, savedLocation.longitude, savedLocation.locationName);
    } else {
      // No location saved, show setup
      showLocationSetup();
    }
  } catch (error) {
    showError('Failed to load saved location');
  }
}

// Set time-based theme based on current hour
function setTimeBasedTheme() {
  const hour = new Date().getHours();
  const body = document.body;

  // Remove all time classes
  body.classList.remove('morning', 'afternoon', 'evening', 'night');

  // Apply appropriate class based on time
  if (hour >= 6 && hour < 12) {
    body.classList.add('morning');
  } else if (hour >= 12 && hour < 18) {
    body.classList.add('afternoon');
  } else if (hour >= 18 && hour < 24) {
    body.classList.add('evening');
  } else {
    body.classList.add('night');
  }
}

function showLocationSetup() {
  locationSetup.classList.remove('hidden');
  tideInfo.classList.add('hidden');
  errorMessage.classList.add('hidden');
}

async function showTideInfo(lat, lon, locationName) {
  locationSetup.classList.add('hidden');
  tideInfo.classList.remove('hidden');
  errorMessage.classList.add('hidden');

  // Display location name or fetch it if not provided
  if (locationName) {
    locationDisplay.textContent = locationName;
  } else {
    locationDisplay.textContent = 'Loading location...';
    const name = await reverseGeocode(lat, lon);
    locationDisplay.textContent = name;
    // Save the location name for future use
    await chrome.storage.sync.set({ locationName: name });
  }

  fetchTideData(lat, lon);
}

function showError(message) {
  errorMessage.textContent = message;
  errorMessage.classList.remove('hidden');
}

// Location search input handler
locationSearchInput.addEventListener('input', (e) => {
  const query = e.target.value.trim();

  // Clear previous timeout
  if (searchTimeout) {
    clearTimeout(searchTimeout);
  }

  if (query.length < 2) {
    searchResultsDiv.classList.add('hidden');
    return;
  }

  // Debounce search
  searchTimeout = setTimeout(() => {
    searchLocations(query);
  }, 300);
});

// Toggle manual coordinates
toggleManualBtn.addEventListener('click', () => {
  manualInputsDiv.classList.toggle('hidden');
  if (!manualInputsDiv.classList.contains('hidden')) {
    toggleManualBtn.textContent = 'Hide manual entry';
  } else {
    toggleManualBtn.textContent = 'Or enter coordinates manually';
  }
});

// Save location handler
saveLocationBtn.addEventListener('click', async () => {
  let lat, lon, locationName;

  // Check if a location was selected from search
  if (selectedLocation) {
    lat = selectedLocation.latitude;
    lon = selectedLocation.longitude;
    locationName = selectedLocation.name;
  } else {
    // Use manual coordinates
    lat = parseFloat(latitudeInput.value);
    lon = parseFloat(longitudeInput.value);

    if (isNaN(lat) || isNaN(lon)) {
      showError('Please search for a location or enter valid coordinates');
      return;
    }

    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      showError('Latitude must be between -90 and 90, longitude between -180 and 180');
      return;
    }

    locationName = null; // Will be fetched via reverse geocoding
  }

  try {
    await chrome.storage.sync.set({ latitude: lat, longitude: lon, locationName: locationName });
    showTideInfo(lat, lon, locationName);
  } catch (error) {
    showError('Failed to save location');
  }
});

// Change location handler
changeLocationBtn.addEventListener('click', () => {
  selectedLocation = null;
  locationSearchInput.value = '';
  latitudeInput.value = '';
  longitudeInput.value = '';
  searchResultsDiv.classList.add('hidden');
  manualInputsDiv.classList.add('hidden');
  toggleManualBtn.textContent = 'Or enter coordinates manually';
  showLocationSetup();
});

// Search locations using Open-Meteo Geocoding API
async function searchLocations(query) {
  searchResultsDiv.innerHTML = '<div class="search-loading">Searching...</div>';
  searchResultsDiv.classList.remove('hidden');

  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Search failed');
    }

    const data = await response.json();

    if (!data.results || data.results.length === 0) {
      searchResultsDiv.innerHTML = '<div class="search-loading">No locations found</div>';
      return;
    }

    // Display results
    searchResultsDiv.innerHTML = '';
    data.results.forEach(result => {
      const resultDiv = document.createElement('div');
      resultDiv.className = 'search-result-item';

      const nameDiv = document.createElement('div');
      nameDiv.className = 'search-result-name';
      nameDiv.textContent = result.name;

      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'search-result-details';
      const details = [result.admin1, result.country].filter(Boolean).join(', ');
      detailsDiv.textContent = details;

      resultDiv.appendChild(nameDiv);
      resultDiv.appendChild(detailsDiv);

      // Click handler
      resultDiv.addEventListener('click', () => {
        selectLocation(result);
      });

      searchResultsDiv.appendChild(resultDiv);
    });
  } catch (error) {
    searchResultsDiv.innerHTML = '<div class="search-loading">Search failed. Please try again.</div>';
  }
}

// Handle location selection from search results
function selectLocation(result) {
  selectedLocation = {
    latitude: result.latitude,
    longitude: result.longitude,
    name: `${result.name}, ${result.country}`
  };

  locationSearchInput.value = selectedLocation.name;
  searchResultsDiv.classList.add('hidden');
}

// Reverse geocode coordinates to location name using BigDataCloud
async function reverseGeocode(lat, lon) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error('Reverse geocoding failed');
    }

    const data = await response.json();

    // Build location name from available data
    const parts = [];
    if (data.locality) parts.push(data.locality);
    if (data.principalSubdivision) parts.push(data.principalSubdivision);
    if (data.countryName) parts.push(data.countryName);

    return parts.length > 0 ? parts.join(', ') : `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    return `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`;
  }
}

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

// DIAGNOSTIC FUNCTION: Analyze API data quality
function analyzeTideData(seaLevels, times) {
  console.group('📊 TIDE DATA QUALITY ANALYSIS');

  // 1. Basic statistics
  const validLevels = seaLevels.filter(v => v != null);
  const min = Math.min(...validLevels);
  const max = Math.max(...validLevels);
  const range = max - min;
  const avg = validLevels.reduce((sum, v) => sum + v, 0) / validLevels.length;

  console.log('📈 Basic Statistics:');
  console.log(`  Min: ${min.toFixed(3)} m`);
  console.log(`  Max: ${max.toFixed(3)} m`);
  console.log(`  Range: ${range.toFixed(3)} m`);
  console.log(`  Average: ${avg.toFixed(3)} m`);
  console.log(`  Tidal range: ${range.toFixed(3)} m (${range < 0.5 ? 'SMALL - microtidal' : range < 2 ? 'MEDIUM - mesotidal' : 'LARGE - macrotidal'})`);

  // 2. Rate of change analysis (first derivative)
  console.log('\n📉 Rate of Change Analysis:');
  const changes = [];
  for (let i = 1; i < seaLevels.length; i++) {
    if (seaLevels[i] != null && seaLevels[i-1] != null) {
      changes.push(Math.abs(seaLevels[i] - seaLevels[i-1]));
    }
  }

  const maxChange = Math.max(...changes);
  const avgChange = changes.reduce((sum, v) => sum + v, 0) / changes.length;
  console.log(`  Max hourly change: ${maxChange.toFixed(4)} m/hour`);
  console.log(`  Avg hourly change: ${avgChange.toFixed(4)} m/hour`);
  console.log(`  Data smoothness: ${maxChange < 0.2 ? '✅ SMOOTH' : '⚠️ NOISY'}`);

  // 3. Detect all local peaks with their characteristics
  console.log('\n🔍 All Detected Peaks (raw 3-point detection):');
  const allPeaks = [];
  for (let i = 1; i < seaLevels.length - 1; i++) {
    const y1 = seaLevels[i - 1];
    const y2 = seaLevels[i];
    const y3 = seaLevels[i + 1];

    if (y1 == null || y2 == null || y3 == null) continue;

    const isHigh = y2 > y1 && y2 > y3;
    const isLow = y2 < y1 && y2 < y3;

    if (isHigh || isLow) {
      const prominence = Math.abs(y2 - ((y1 + y3) / 2));
      const time = new Date(times[i]);

      allPeaks.push({
        type: isHigh ? 'HIGH' : 'LOW',
        time: time,
        height: y2.toFixed(3),
        prominence: prominence.toFixed(4),
        index: i
      });
    }
  }

  console.table(allPeaks.map(p => ({
    Type: p.type,
    Time: p.time.toLocaleTimeString('en-US', {hour: '2-digit', minute: '2-digit'}),
    Height: p.height + ' m',
    Prominence: p.prominence + ' m',
    Index: p.index
  })));

  // 4. Check for consecutive same-type peaks
  console.log('\n⚠️ Alternation Check:');
  let consecutiveIssues = 0;
  for (let i = 1; i < allPeaks.length; i++) {
    if (allPeaks[i].type === allPeaks[i-1].type) {
      const timeDiff = (allPeaks[i].time - allPeaks[i-1].time) / (1000 * 60 * 60);
      console.warn(`  ❌ Consecutive ${allPeaks[i].type} at index ${allPeaks[i-1].index} and ${allPeaks[i].index} (${timeDiff.toFixed(1)} hours apart)`);
      consecutiveIssues++;
    }
  }
  if (consecutiveIssues === 0) {
    console.log('  ✅ All peaks properly alternate');
  } else {
    console.warn(`  ⚠️ Found ${consecutiveIssues} consecutive same-type peak(s)`);
  }

  // 5. Time separation analysis
  console.log('\n⏱️ Time Separation Between Peaks:');
  for (let i = 1; i < allPeaks.length; i++) {
    const timeDiff = (allPeaks[i].time - allPeaks[i-1].time) / (1000 * 60 * 60);
    const expected = timeDiff >= 5.5 && timeDiff <= 13;
    console.log(`  ${allPeaks[i-1].type} → ${allPeaks[i].type}: ${timeDiff.toFixed(2)} hours ${expected ? '✅' : '⚠️ UNUSUAL'}`);
  }

  // 6. Export raw data for external analysis
  console.log('\n💾 CSV Export (copy for external analysis):');
  const csvHeader = 'Time,Sea_Level_m,Index';
  const csvRows = times.map((t, i) => `${t},${seaLevels[i] != null ? seaLevels[i].toFixed(4) : 'null'},${i}`);
  const csv = [csvHeader, ...csvRows].join('\n');
  console.log(csv);

  console.groupEnd();
}

function displayTideData(data) {
  if (!data.hourly || !data.hourly.time || !data.hourly.sea_level_height_msl) {
    tideDataDiv.innerHTML = '<div class="error">No tide data available for this location</div>';
    return;
  }

  const times = data.hourly.time;
  const seaLevels = data.hourly.sea_level_height_msl;

  if (DEBUG_MODE) {
    // Debug: Log data
    console.log('Total data points:', seaLevels.length);
    console.log('First 12 hours sea levels:', seaLevels.slice(0, 12));
    console.log('First time string:', times[0]);

    // DIAGNOSTIC LOGGING: Analyze data quality
    analyzeTideData(seaLevels, times);
  }

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

  if (DEBUG_MODE) {
    console.log('Current index:', currentIndex);
  }

  // Determine if tide is rising or falling
  const currentHeight = seaLevels[currentIndex];
  const nextHeight = seaLevels[currentIndex + 1] || currentHeight;

  const isRising = nextHeight > currentHeight;
  const tideStatus = isRising ? '📈 Rising' : '📉 Falling';

  // Find precise tide times using quadratic interpolation
  const preciseTides = getPreciseTides({ sea_level_height_msl: seaLevels, time: times });

  if (DEBUG_MODE) {
    console.log('Precise tides:', preciseTides);
  }

  // Find next high and low from current time
  const nextHigh = preciseTides.find(t => t.type === 'HIGH' && new Date(t.time) > now);
  const nextLow = preciseTides.find(t => t.type === 'LOW' && new Date(t.time) > now);

  // Find most recent high or low tide
  const pastTides = preciseTides.filter(t => new Date(t.time) <= now);
  const lastTide = pastTides.length > 0 ? pastTides[pastTides.length - 1] : null;

  if (DEBUG_MODE) {
    console.log('Next high:', nextHigh);
    console.log('Next low:', nextLow);
    console.log('Last tide:', lastTide);
  }

  // Build current tide description
  let currentTideInfo = `Sea Level: ${currentHeight ? currentHeight.toFixed(2) + ' m' : 'N/A'}`;
  if (lastTide) {
    const lastTideTime = new Date(lastTide.time);
    const formattedLastTime = lastTideTime.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
    const tideType = lastTide.type === 'HIGH' ? 'High' : 'Low';
    currentTideInfo += `<br>Last <strong>${tideType}</strong> Tide at ${formattedLastTime}`;
  }

  let html = `
    <div class="tide-item current">
      <div class="tide-label">Current Tide</div>
      <div class="tide-value">${tideStatus}</div>
      <div class="tide-time">${currentTideInfo}</div>
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
  const candidates = [];

  // STEP 1: Find all potential peaks/troughs with quadratic interpolation
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
      // Calculate prominence (how strong this peak is)
      const prominence = Math.abs(y2 - ((y1 + y3) / 2));

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

      candidates.push({
        type: isHigh ? 'HIGH' : 'LOW',
        time: preciseTime.toISOString(), // Precise minute!
        timeMs: preciseTime.getTime(),
        height: preciseHeight.toFixed(2),
        prominence: prominence,
        index: i
      });
    }
  }

  // STEP 2: Filter candidates using minimum time separation
  const filteredTides = filterByTimeSeparation(candidates);

  // STEP 3: Post-process to ensure alternation (safety net)
  const validatedTides = enforceAlternation(filteredTides);

  // STEP 4: Validate final results and warn if issues found
  validateTideSequence(validatedTides);

  return validatedTides;
}

// Helper function: Filter tides by minimum time separation
function filterByTimeSeparation(candidates) {
  if (candidates.length === 0) return [];

  const filtered = [candidates[0]]; // Always include first candidate

  for (let i = 1; i < candidates.length; i++) {
    const current = candidates[i];
    const last = filtered[filtered.length - 1];

    const timeDiff = current.timeMs - last.timeMs;

    // Check if enough time has passed since last tide
    if (timeDiff >= TIDAL_CONSTANTS.MIN_TIDE_SEPARATION_MS) {
      filtered.push(current);
    } else {
      // If within minimum separation, keep the more prominent peak
      console.warn(`⚠️ Filtering: ${current.type} at index ${current.index} too close to ${last.type} at index ${last.index} (${(timeDiff / (1000 * 60 * 60)).toFixed(1)}h apart)`);
      if (current.prominence > last.prominence) {
        console.log(`   → Replacing with more prominent peak`);
        filtered[filtered.length - 1] = current;
      } else {
        console.log(`   → Keeping existing peak`);
      }
    }
  }

  return filtered;
}

// Helper function: Ensure tides alternate HIGH-LOW-HIGH-LOW
function enforceAlternation(tides) {
  if (tides.length < 2) return tides;

  const validated = [tides[0]];

  for (let i = 1; i < tides.length; i++) {
    const current = tides[i];
    const last = validated[validated.length - 1];

    // Check if current tide alternates with last validated tide
    if (current.type !== last.type) {
      validated.push(current);
    } else {
      // Consecutive same-type tides detected (should be rare after time filtering)
      console.warn(`⚠️ ALTERNATION ISSUE: Consecutive ${current.type} tides detected at index ${last.index} and ${current.index}`);

      // Keep the one with greater prominence
      if (current.prominence > last.prominence) {
        console.log(`   → Replacing with more prominent ${current.type} tide`);
        validated[validated.length - 1] = current;
      } else {
        console.log(`   → Keeping existing ${last.type} tide`);
      }
    }
  }

  return validated;
}

// Helper function: Validate the final tide sequence
function validateTideSequence(tides) {
  if (!DEBUG_MODE) return; // Skip validation logging in production

  console.group('✅ TIDE VALIDATION');

  if (tides.length === 0) {
    console.warn('⚠️ No tides detected');
    console.groupEnd();
    return;
  }

  let hasIssues = false;

  // Check 1: Alternation
  for (let i = 1; i < tides.length; i++) {
    if (tides[i].type === tides[i - 1].type) {
      console.error(`❌ VALIDATION FAILED: Consecutive ${tides[i].type} tides found!`);
      hasIssues = true;
    }
  }

  // Check 2: Time separation
  for (let i = 1; i < tides.length; i++) {
    const timeDiff = (new Date(tides[i].time).getTime() - new Date(tides[i - 1].time).getTime()) / (1000 * 60 * 60);
    if (timeDiff < TIDAL_CONSTANTS.MIN_TIDE_SEPARATION_HOURS) {
      console.warn(`⚠️ Tides very close: ${tides[i - 1].type} → ${tides[i].type} only ${timeDiff.toFixed(1)} hours apart`);
      hasIssues = true;
    } else if (timeDiff > 13) {
      console.warn(`⚠️ Large gap between tides: ${timeDiff.toFixed(1)} hours (may indicate missing tide)`);
    }
  }

  if (!hasIssues) {
    console.log('✅ All validation checks passed!');
    console.log(`   Found ${tides.length} tides with proper alternation and spacing`);
  }

  console.groupEnd();
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
