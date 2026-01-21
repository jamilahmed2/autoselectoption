// Auto Evaluation Extension v3.0 - Popup Script

// DOM Elements
const evalTypeSelect = document.getElementById('eval-type');
const fetchBtn = document.getElementById('fetch-btn');
const pendingSection = document.getElementById('pending-section');
const pendingList = document.getElementById('pending-list');
const pendingCount = document.getElementById('pending-count');
const selectAllBox = document.getElementById('select-all-box');
const selectAllLabel = document.getElementById('select-all-label');
const selectedCountSpan = document.getElementById('selected-count');
const ratingSelect = document.getElementById('rating');
const commentTextarea = document.getElementById('comment');
const applyBtn = document.getElementById('apply-btn');
const testBtn = document.getElementById('test-btn');
const submitBtn = document.getElementById('submit-btn');
const stopBtn = document.getElementById('stop-btn');
const statusBox = document.getElementById('status-box');
const statusText = document.getElementById('status-text');
const progressFill = document.getElementById('progress-fill');
const modeBtns = document.querySelectorAll('.mode-btn');

// State
let pendingEvaluations = [];
let selectedEvaluations = new Set();

// Mode Toggle
modeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    modeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    document.querySelectorAll('.mode-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`mode-${btn.dataset.mode}`).classList.add('active');
  });
});

// Fetch Evaluations
fetchBtn.addEventListener('click', async () => {
  const type = evalTypeSelect.value;

  fetchBtn.disabled = true;
  fetchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
  pendingList.innerHTML = '<div class="loading"><i class="fas fa-circle-notch"></i></div>';
  pendingSection.style.display = 'block';

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'FETCH_EVALUATIONS',
      type: type
    });

    if (response.success) {
      pendingEvaluations = response.evaluations;
      renderPendingList();
    } else if (response.notLoggedIn) {
      pendingList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-sign-in-alt"></i>
          <p>Not logged in!</p>
          <p style="margin-top: 8px;">
            <a href="https://sp.hamdard.edu.pk/login" target="_blank" 
               style="color: var(--accent); text-decoration: underline;">
              Click here to login →
            </a>
          </p>
        </div>`;
    } else {
      pendingList.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-exclamation-circle"></i>
          <p>Error: ${response.error}</p>
        </div>`;
    }
  } catch (error) {
    console.error('Fetch error:', error);
    pendingList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-circle"></i>
        <p>Error: ${error.message}</p>
      </div>`;
  }

  fetchBtn.disabled = false;
  fetchBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Fetch';
});

// Render Pending List
function renderPendingList() {
  if (pendingEvaluations.length === 0) {
    pendingList.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-check-circle"></i>
        <p>All evaluations completed!</p>
      </div>`;
    pendingCount.textContent = '(0)';
    selectAllBox.style.display = 'none';
    return;
  }

  pendingCount.textContent = `(${pendingEvaluations.length})`;
  selectedEvaluations.clear();
  selectAllBox.style.display = 'flex';

  pendingList.innerHTML = pendingEvaluations.map((item, index) => `
    <div class="pending-item" data-index="${index}">
      <div class="custom-checkbox" data-index="${index}">
        <i class="fas fa-check"></i>
      </div>
      <div class="pending-info">
        <div class="pending-course">${item.course}</div>
        <div class="pending-teacher">${item.teacher}</div>
      </div>
      <div class="pending-nav" data-url="${item.url}" title="Open in new tab">
        <i class="fas fa-external-link-alt"></i>
      </div>
    </div>
  `).join('');

  // Checkbox click handlers
  document.querySelectorAll('.pending-item .custom-checkbox').forEach(checkbox => {
    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      const index = parseInt(checkbox.dataset.index);
      checkbox.classList.toggle('checked');

      if (checkbox.classList.contains('checked')) {
        selectedEvaluations.add(index);
      } else {
        selectedEvaluations.delete(index);
      }
      updateSelectedCount();
    });
  });

  // Navigate click handlers
  document.querySelectorAll('.pending-nav').forEach(nav => {
    nav.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = nav.dataset.url;
      chrome.tabs.create({ url: url, active: true });
    });
  });

  updateSelectedCount();
}

// Select All
selectAllBox.addEventListener('click', () => {
  const isChecked = selectAllBox.classList.contains('checked');
  selectAllBox.classList.toggle('checked');

  const checkboxes = document.querySelectorAll('.pending-item .custom-checkbox');
  checkboxes.forEach((checkbox, index) => {
    if (!isChecked) {
      checkbox.classList.add('checked');
      selectedEvaluations.add(index);
    } else {
      checkbox.classList.remove('checked');
      selectedEvaluations.delete(index);
    }
  });
  updateSelectedCount();
});

selectAllLabel.addEventListener('click', () => selectAllBox.click());

// Update Selected Count
function updateSelectedCount() {
  const count = selectedEvaluations.size;
  selectedCountSpan.textContent = `${count} selected`;
  testBtn.innerHTML = `<i class="fas fa-flask"></i> Test (${count})`;
  submitBtn.innerHTML = `<i class="fas fa-paper-plane"></i> Submit (${count})`;

  const allChecked = pendingEvaluations.length > 0 && count === pendingEvaluations.length;
  if (allChecked) {
    selectAllBox.classList.add('checked');
  } else {
    selectAllBox.classList.remove('checked');
  }
}

// Apply to Current Page (Manual Mode)
applyBtn.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Check if on portal
  if (!tab.url || !tab.url.includes('sp.hamdard.edu.pk')) {
    alert('⚠️ Please login to the Student Portal first!\n\nGo to: sp.hamdard.edu.pk');
    return;
  }

  const rating = ratingSelect.value;
  const comment = commentTextarea.value.trim();

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: applyToCurrentPage,
    args: [rating, comment]
  });

  applyBtn.innerHTML = '<i class="fas fa-check"></i> Applied!';
  setTimeout(() => {
    applyBtn.innerHTML = '<i class="fas fa-magic"></i> Apply to Current Page';
  }, 1500);
});

function applyToCurrentPage(rating, comment) {
  const radios = document.querySelectorAll(`input[type="radio"][value="${rating}"]`);
  radios.forEach(r => {
    r.checked = true;
    r.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(t => {
    if (comment) {
      t.value = comment;
      t.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });

  console.log(`Applied: Rating=${rating}, Comment=${comment || '(none)'}`);
}

// Test Selected (Auto Mode)
testBtn.addEventListener('click', () => startBatch(true));

// Submit Selected (Auto Mode)
submitBtn.addEventListener('click', () => startBatch(false));

// Start Batch Processing
async function startBatch(testMode) {
  // Check if fetched evaluations exist (means user is logged in)
  if (pendingEvaluations.length === 0) {
    alert('⚠️ Please click "Fetch" first to load evaluations!\n\nMake sure you are logged into the Student Portal.');
    return;
  }

  if (selectedEvaluations.size === 0) {
    alert('Please select at least one evaluation!');
    return;
  }

  const selectedLinks = Array.from(selectedEvaluations).map(i => pendingEvaluations[i]);
  const modeText = testMode ? 'TEST (will NOT submit)' : 'LIVE (will SUBMIT!)';

  const confirmed = confirm(
    `${modeText}\n\n` +
    `Process ${selectedLinks.length} evaluations?\n` +
    `Rating: ${ratingSelect.options[ratingSelect.selectedIndex].text}\n\n` +
    `${testMode ? 'Test mode - forms filled but not submitted.' : '⚠️ This cannot be undone!'}`
  );

  if (!confirmed) return;

  testBtn.style.display = 'none';
  submitBtn.style.display = 'none';
  stopBtn.style.display = 'flex';
  statusBox.classList.add('active');
  statusText.textContent = 'Starting...';
  statusText.className = 'status-text';

  chrome.runtime.sendMessage({
    action: 'START_BATCH_SUBMIT',
    data: {
      links: selectedLinks,
      optionValue: ratingSelect.value,
      commentValue: commentTextarea.value.trim(),
      testMode: testMode
    }
  });

  startStatusPolling();
}

// Stop Button
stopBtn.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'STOP_BATCH' });
  stopBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Stopping...';
  stopBtn.disabled = true;
});

// Status Polling
let pollingInterval = null;

function startStatusPolling() {
  if (pollingInterval) clearInterval(pollingInterval);

  pollingInterval = setInterval(async () => {
    try {
      const status = await chrome.runtime.sendMessage({ action: 'GET_STATUS' });

      if (status) {
        const percent = status.totalLinks > 0
          ? Math.round((status.currentIndex / status.totalLinks) * 100)
          : 0;

        progressFill.style.width = `${percent}%`;
        const icon = status.testMode ? '<i class="fas fa-flask"></i>' : '<i class="fas fa-paper-plane"></i>';
        statusText.innerHTML = `${icon} ${status.currentIndex}/${status.totalLinks} &nbsp; <i class="fas fa-check" style="color: var(--accent);"></i>${status.completedCount} &nbsp; <i class="fas fa-times" style="color: var(--danger);"></i>${status.failedCount}`;

        if (!status.isProcessing) {
          clearInterval(pollingInterval);
          pollingInterval = null;
          onBatchComplete(status);
        }
      }
    } catch (e) {
      console.error('Polling error:', e);
    }
  }, 500);
}

function onBatchComplete(status) {
  testBtn.style.display = 'flex';
  submitBtn.style.display = 'flex';
  stopBtn.style.display = 'none';
  stopBtn.innerHTML = '<i class="fas fa-stop"></i> Stop';
  stopBtn.disabled = false;

  progressFill.style.width = '100%';

  if (status.failedCount === 0) {
    statusText.innerHTML = `<i class="fas fa-check-circle"></i> Done! ${status.completedCount} ${status.testMode ? 'tested' : 'submitted'}`;
    statusText.className = 'status-text success';
  } else {
    statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${status.completedCount} OK, ${status.failedCount} failed`;
    statusText.className = 'status-text error';
  }
}

// Check if already processing
chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (status) => {
  if (status && status.isProcessing) {
    testBtn.style.display = 'none';
    submitBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    statusBox.classList.add('active');
    startStatusPolling();
  }
});
