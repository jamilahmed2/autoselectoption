// Background Service Worker for Auto Evaluation Extension v3.0
// Handles fetching evaluations and batch processing

let processingState = {
    isProcessing: false,
    currentIndex: 0,
    totalLinks: 0,
    completedCount: 0,
    failedCount: 0,
    testMode: true
};

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'FETCH_EVALUATIONS') {
        fetchEvaluations(message.type).then(sendResponse);
        return true;
    } else if (message.action === 'START_BATCH_SUBMIT') {
        startBatchSubmit(message.data);
        sendResponse({ status: 'started' });
    } else if (message.action === 'GET_STATUS') {
        sendResponse({
            isProcessing: processingState.isProcessing,
            currentIndex: processingState.currentIndex,
            totalLinks: processingState.totalLinks,
            completedCount: processingState.completedCount,
            failedCount: processingState.failedCount,
            testMode: processingState.testMode
        });
    } else if (message.action === 'STOP_BATCH') {
        processingState.isProcessing = false;
        sendResponse({ status: 'stopped' });
    }
    return true;
});

// Fetch evaluations by opening page in background tab and scraping
async function fetchEvaluations(type) {
    const url = type === 'teacher'
        ? 'https://sp.hamdard.edu.pk/teacher/evaluation'
        : 'https://sp.hamdard.edu.pk/course/evaluation';

    console.log(`📥 Fetching ${type} evaluations...`);

    try {
        // Open the evaluation page in a background tab
        const tab = await chrome.tabs.create({
            url: url,
            active: false // Background tab
        });

        // Wait for page to load
        await waitForTabLoad(tab.id);
        await sleep(1500); // Extra wait for content

        // Execute scraping script in the tab
        const results = await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: scrapeEvaluationPage,
            args: [type]
        });

        // Close the tab
        await chrome.tabs.remove(tab.id);

        const result = results[0]?.result;

        // Check for login/page errors
        if (result && result.notLoggedIn) {
            return {
                success: false,
                error: 'Not logged in! Please login to the Student Portal first.',
                notLoggedIn: true,
                evaluations: []
            };
        }

        if (result && result.wrongPage) {
            return {
                success: false,
                error: 'Could not load evaluation page. Please try again.',
                evaluations: []
            };
        }

        const evaluations = Array.isArray(result) ? result : [];
        console.log(`✅ Found ${evaluations.length} pending ${type} evaluations`);

        return {
            success: true,
            evaluations: evaluations,
            type: type
        };

    } catch (error) {
        console.error(`❌ Error fetching evaluations:`, error);
        return {
            success: false,
            error: error.message,
            evaluations: []
        };
    }
}

// Function injected into page to scrape evaluations
function scrapeEvaluationPage(type) {
    // Check if user is logged in
    const loginForm = document.querySelector('form[action*="login"]');
    const loginButton = document.querySelector('button[type="submit"]')?.textContent?.toLowerCase().includes('login');
    const currentUrl = window.location.href;

    // Detect login page indicators
    if (loginForm || currentUrl.includes('/login') || currentUrl.includes('/auth') ||
        document.body.textContent.includes('Please login') ||
        document.body.textContent.includes('Sign in to continue')) {
        console.log('❌ Not logged in - detected login page');
        return { notLoggedIn: true };
    }

    const pendingEvaluations = [];
    const rows = document.querySelectorAll('table tr');

    console.log(`📋 Scraping ${type} evaluation page, found ${rows.length} rows`);

    // Check if we're on the right page
    if (rows.length === 0) {
        const pageTitle = document.querySelector('h4.text-themecolor, .card-title')?.textContent || '';
        if (!pageTitle.toLowerCase().includes('evaluation')) {
            console.log('❌ Not on evaluation page');
            return { wrongPage: true };
        }
    }

    rows.forEach(row => {
        // Find "Go for Evaluation" links (incomplete evaluations)
        const evalLink = row.querySelector('a.btn-outline-success[href*="/evaluation/form/"]');

        if (evalLink) {
            const cells = row.querySelectorAll('td');
            const startDate = cells[0]?.textContent?.trim() || '';
            const courseName = cells[1]?.textContent?.trim() || 'Unknown Course';
            const teacherName = cells[2]?.textContent?.trim() || 'Unknown Teacher';
            const offerNo = cells[3]?.textContent?.trim() || '';

            pendingEvaluations.push({
                url: evalLink.href,
                course: courseName,
                teacher: teacherName,
                startDate: startDate,
                offerNo: offerNo,
                type: type
            });
        }
    });

    console.log(`✅ Found ${pendingEvaluations.length} pending evaluations`);
    return pendingEvaluations;
}

// Start batch submission for selected evaluations
async function startBatchSubmit(data) {
    processingState = {
        isProcessing: true,
        currentIndex: 0,
        totalLinks: data.links.length,
        completedCount: 0,
        failedCount: 0,
        testMode: data.testMode !== undefined ? data.testMode : true
    };

    console.log('='.repeat(60));
    console.log(`🚀 STARTING BATCH ${processingState.testMode ? '[TEST MODE]' : '[LIVE MODE]'}`);
    console.log(`📋 Selected evaluations: ${data.links.length}`);
    console.log(`⭐ Rating: ${data.optionValue}`);
    console.log('='.repeat(60));

    for (let i = 0; i < data.links.length; i++) {
        if (!processingState.isProcessing) {
            console.log('⏹️ Stopped by user');
            break;
        }

        processingState.currentIndex = i + 1;
        const link = data.links[i];

        console.log(`\n📝 Processing ${i + 1}/${data.links.length}: ${link.course}`);

        try {
            await processEvaluation(link, data.optionValue, data.commentValue, processingState.testMode);
            processingState.completedCount++;
            console.log(`   ✅ SUCCESS`);
        } catch (error) {
            processingState.failedCount++;
            console.error(`   ❌ FAILED: ${error.message}`);
        }

        if (i < data.links.length - 1) {
            await sleep(2500);
        }
    }

    processingState.isProcessing = false;

    console.log('\n' + '='.repeat(60));
    console.log('🏁 BATCH COMPLETE!');
    console.log(`   ✅ Completed: ${processingState.completedCount}`);
    console.log(`   ❌ Failed: ${processingState.failedCount}`);
    console.log('='.repeat(60));
}

// Process a single evaluation
async function processEvaluation(link, optionValue, commentValue, testMode) {
    return new Promise(async (resolve, reject) => {
        try {
            const tab = await chrome.tabs.create({
                url: link.url,
                active: testMode
            });

            await waitForTabLoad(tab.id);
            await sleep(2000);

            const results = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: fillAndSubmitEvaluation,
                args: [optionValue, commentValue, testMode, link.course]
            });

            const result = results[0]?.result;

            if (result && result.success) {
                await sleep(testMode ? 3000 : 2000);
                await chrome.tabs.remove(tab.id);
                resolve(result);
            } else {
                await chrome.tabs.remove(tab.id);
                reject(new Error(result?.error || 'Unknown error'));
            }
        } catch (error) {
            reject(error);
        }
    });
}

// Function injected into page to fill and submit form
function fillAndSubmitEvaluation(optionValue, commentValue, testMode, courseName) {
    try {
        console.log(`🔧 ${testMode ? 'TEST' : 'LIVE'} MODE - ${courseName}`);

        // Select radio buttons
        const radioButtons = document.querySelectorAll(`input[type="radio"][value="${optionValue}"]`);
        let checkedCount = 0;
        radioButtons.forEach(radio => {
            radio.checked = true;
            radio.dispatchEvent(new Event('change', { bubbles: true }));
            checkedCount++;
        });
        console.log(`📻 Checked ${checkedCount} radios`);

        // Fill textareas
        const textareas = document.querySelectorAll('textarea');
        textareas.forEach(textarea => {
            if (commentValue) {
                textarea.value = commentValue;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
            }
        });

        // Find submit button
        const submitSelectors = [
            'button[type="submit"]',
            'input[type="submit"]',
            '.btn-success[type="submit"]',
            'button.btn-success',
            'button.btn-clr'
        ];

        let submitBtn = null;
        for (const selector of submitSelectors) {
            submitBtn = document.querySelector(selector);
            if (submitBtn) break;
        }

        if (!submitBtn) {
            const buttons = document.querySelectorAll('button, input[type="submit"]');
            for (const btn of buttons) {
                const text = (btn.textContent || btn.value || '').toLowerCase();
                if (text.includes('submit') || text.includes('save')) {
                    submitBtn = btn;
                    break;
                }
            }
        }

        if (testMode) {
            if (submitBtn) {
                submitBtn.style.border = '3px solid red';
                submitBtn.style.boxShadow = '0 0 10px red';
            }
            alert(`🧪 TEST: ${courseName}\n✅ Radios: ${checkedCount}\n✅ Submit: ${submitBtn ? 'Found' : 'Not found'}`);
            return { success: true, testMode: true };
        } else {
            if (submitBtn) {
                submitBtn.click();
                return { success: true, testMode: false };
            } else {
                const form = document.querySelector('form');
                if (form) {
                    form.submit();
                    return { success: true, testMode: false };
                }
                return { success: false, error: 'Submit button not found' };
            }
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
        function listener(updatedTabId, changeInfo) {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                resolve();
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
        setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
        }, 15000);
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

console.log('🔧 Auto Evaluation Extension v3.0 - Ready');
