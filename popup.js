document.getElementById('apply').addEventListener('click', async () => {
    const selectedValue = document.getElementById('option').value;
    const commentValue = document.getElementById('comment').value.trim();
  
    // Send the selected and comment values to the content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: handleSelectionsAndComments,
      args: [selectedValue, commentValue]
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
  