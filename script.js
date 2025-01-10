document.getElementById('apply').addEventListener('click', async () => {
  const selectedValue = document.getElementById('option').value;
  const commentValue = document.getElementById('comment').value.trim();

  // Send the selected and comment values to the content script
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: handleSelectionsAndComments,
    args: [selectedValue, commentValue],
  });
});

// Function to select options and fill comments
function handleSelectionsAndComments(optionValue, commentValue) {
  // Handle radio/checkbox inputs
  const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  const inputGroups = {};
  inputs.forEach(input => {
    const name = input.name;
    if (!inputGroups[name]) {
      inputGroups[name] = [];
    }
    inputGroups[name].push(input);
  });

  Object.values(inputGroups).forEach(group => {
    group.forEach(input => {
      if (input.value === optionValue) {
        input.checked = true;
      }
    });
  });

  // Handle textareas
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    if (commentValue) {
      textarea.value = commentValue; // Auto-fill the comment
    } else {
      textarea.placeholder = "Enter your comments manually"; // Prompt for manual input
    }
  });
}

// Clear Options Button
document.getElementById('clear-options').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: clearSelections,
  });
});

// Function to clear selected radio/checkbox options
function clearSelections() {
  const inputs = document.querySelectorAll('input[type="radio"], input[type="checkbox"]');
  inputs.forEach(input => {
    input.checked = false; // Uncheck all options
  });
}

// Clear Comment Button
document.getElementById('clear-comment').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: clearComments,
  });
});

// Function to clear comments
function clearComments() {
  const textareas = document.querySelectorAll('textarea');
  textareas.forEach(textarea => {
    textarea.value = ""; // Clear all textareas
  });
}
