const puppeteer = require('puppeteer');
const fs = require('fs');
const Epub = require('epub-gen');

// Function to display help message
function displayHelp() {
    console.log('Usage: node joara_scraper.js [options] <bookId1|url1> <bookId2|url2> ...');
    console.log('Options:');
    console.log('  -waitTime <ms>          Wait time in milliseconds between chapters (default: 5000ms)');
    console.log('  -bookWait <ms>  Wait time in milliseconds between books (default: 0ms)');
    console.log('  -cooldown <n> <m>       After every <n> chapters, cooldown for <m> minutes');
    console.log('  -help                   Display this help message and exit');
    console.log('Example:');
    console.log('  node joara_scraper.js 12345 -waitTime 3000 -bookWait 60000 -cooldown 5 10');
    console.log('  node joara_scraper.js https://www.joara.com/book/6789 -help');
}

async function handleCaptcha(page, browser, chapter) {
    console.log('CAPTCHA detected. Reloading to "https://www.joara.com/defender" for manual solving...');

    // Close the current headless browser
    await browser.close();

    // Retry mechanism for CAPTCHA solving
    let captchaRetryCount = 0;
    const maxCaptchaRetries = 3;
    const captchaCooldown = 120000; // 2 minutes cooldown

    while (captchaRetryCount < maxCaptchaRetries) {
        try {
            // Launch a new non-headless browser with a custom user data directory
            const customUserDataDir = './puppeteer_profile';
            const nonHeadlessBrowser = await puppeteer.launch({
                headless: false,
                userDataDir: customUserDataDir,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled', // Disable automation detection
                ],
            });

            const nonHeadlessPage = await nonHeadlessBrowser.newPage();

            // Navigate to the specified CAPTCHA page
            await nonHeadlessPage.goto('https://www.joara.com/defender', { waitUntil: 'networkidle2', timeout: 60000 });

            console.log('Waiting for CAPTCHA to fully load...');

            // Wait for the CAPTCHA to appear
            try {
                await nonHeadlessPage.waitForSelector('.recaptcha-page', { timeout: 30000 });
            } catch (error) {
                console.error('CAPTCHA did not load on "https://www.joara.com/defender". Please check the page manually.');
                await nonHeadlessBrowser.close();
                throw error;
            }

            console.log('CAPTCHA loaded. Please solve it manually in the browser window...');

            // Wait for the CAPTCHA to be solved and the page to reload
            try {
                await nonHeadlessPage.waitForFunction(
                    () => document.querySelector('.recaptcha-page') === null,
                    { timeout: 0 }
                );
            } catch (error) {
                console.error('Failed to solve CAPTCHA. Please try again.');
                await nonHeadlessBrowser.close();
                throw error;
            }

            console.log('CAPTCHA solved. Navigating back to the chapter page...');
            await nonHeadlessPage.goto(chapter.href, { waitUntil: 'networkidle2', timeout: 60000 });

            // Close the non-headless browser with retry mechanism
            let retryCount = 0;
            const maxRetries = 3;

            while (retryCount < maxRetries) {
                try {
                    await nonHeadlessBrowser.close();
                    break; // Exit the loop if successful
                } catch (error) {
                    retryCount++;
                    console.error(`Error closing browser (Attempt ${retryCount}):`, error);
                    if (retryCount >= maxRetries) {
                        throw error; // Re-throw the error after max retries
                    }
                    await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait 1 second before retrying
                }
            }

            // Clean up the custom user data directory
            fs.rmSync(customUserDataDir, { recursive: true, force: true });

            // Re-launch the headless browser and return to the original flow
            const newBrowser = await puppeteer.launch({
                headless: true,
                protocolTimeout: 0,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                    '--window-size=1920,1080',
                    '--disable-blink-features=AutomationControlled', // Disable automation detection
                ],
            });

            const newPage = await newBrowser.newPage();
            await newPage.goto(chapter.href, { waitUntil: 'networkidle2', timeout: 60000 });

            return { newBrowser, newPage };
        } catch (error) {
            captchaRetryCount++;
            console.error(`CAPTCHA solving failed. Attempt ${captchaRetryCount} of ${maxCaptchaRetries}.`);

            if (captchaRetryCount >= maxCaptchaRetries) {
                console.error('CAPTCHA failed to solve after maximum retries. Waiting for 2 minutes before retrying...');
                await new Promise((resolve) => setTimeout(resolve, captchaCooldown)); // Wait 2 minutes
                captchaRetryCount = 0; // Reset retry count
            } else {
                // Wait for a short cooldown before retrying
                await new Promise((resolve) => setTimeout(resolve, 5000));
            }
        }
    }

    throw new Error('CAPTCHA solving failed after maximum retries.');
}

async function scrapeBook(bookId, waitTime, cooldownChapters, cooldownMinutes) {
    // Launch a headless browser
    let browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 0,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--disable-gpu',
            '--window-size=1920,1080',
            '--disable-blink-features=AutomationControlled',
        ],
    });
    let page = await browser.newPage();

    // Disguise Puppeteer as a regular browser
    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    );
    await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // Navigate to the Joara book page
    const bookUrl = `https://www.joara.com/book/${bookId}`;
    console.log(`Navigating to: ${bookUrl}`);

    // Retry logic for internet connection issues
    let retryCount = 0;
    while (true) {
        try {
            await page.goto(bookUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            break; // Exit the loop if successful
        } catch (error) {
            if (error.message.includes('net::ERR_INTERNET_DISCONNECTED') || error.message.includes('net::ERR_CONNECTION_RESET')) {
                retryCount++;
                console.error(`Internet connection issue detected. Retrying in 30 seconds... (Attempt ${retryCount})`);
                await new Promise((resolve) => setTimeout(resolve, 30000)); // Wait 30 seconds before retrying
            } else {
                throw error; // Re-throw other errors
            }
        }
    }

    console.log('Waiting for page to fully load...');
    await page.waitForSelector('body', { timeout: 30000 });
    await new Promise((resolve) => setTimeout(resolve, 5000)); // Add a cooldown period

    const isCaptchaPage = await page.evaluate(() => {
        return document.querySelector('.recaptcha-page') !== null;
    });

    if (isCaptchaPage) {
        // Handle CAPTCHA by reloading in non-headless mode
        const { newBrowser, newPage } = await handleCaptcha(page, browser, { href: bookUrl });
        browser = newBrowser;
        page = newPage;
    }

    console.log(`Scraping book ID: ${bookId}`);
    console.log('Waiting for chapter list to load...');

    // Extract the book name and author from the chapter list page
    let bookName, authorName;
    let extractionRetryCount = 0;
    const maxExtractionRetries = 3;

    while (extractionRetryCount < maxExtractionRetries) {
        try {
            bookName = await page.evaluate(() => {
                return document.querySelector('.book-info .title').innerText.trim();
            });
            authorName = await page.evaluate(() => {
                return document.querySelector('.nickname button').innerText.trim();
            });
            break; // Exit the loop if successful
        } catch (error) {
            extractionRetryCount++;
            console.error(`Failed to extract book name and author name. Attempt ${extractionRetryCount} of ${maxExtractionRetries}.`);
            if (extractionRetryCount >= maxExtractionRetries) {
                console.error('Failed to extract book name and author name after maximum retries.');
                await browser.close();
                return;
            }
            await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before retrying
        }
    }

    const sanitizedBookName = bookName.replace(/[^a-zA-Z0-9가-힣]/g, '_');
    const sanitizedAuthorName = authorName.replace(/[^a-zA-Z0-9가-힣]/g, '_');

    // Wait for the chapter list container to load
    try {
        await page.waitForSelector('.episode-items', { timeout: 30000 });
    } catch (error) {
        console.error('Chapter list container not found. The page may not have loaded correctly.');
        console.error('Error details:', error.message);
        await browser.close();
        return;
    }

    // Scroll to the bottom of the page to load all chapters dynamically
    console.log('Scrolling to load all chapters...');
    await autoScroll(page);

    // Wait for the chapter list to fully load after scrolling
    try {
        await page.waitForSelector('.episode-items a[href^="/viewer?"]', { timeout: 30000 });
    } catch (error) {
        console.error('Chapter list not found after scrolling. The page may not have loaded correctly.');
        console.error('Error details:', error.message);
        await browser.close();
        return;
    }

    // Extract chapter links
    const chapterLinks = await page.evaluate(() => {
        const links = [];
        const episodeItems = document.querySelectorAll('.episode-items a[href^="/viewer?"]');
        episodeItems.forEach((item) => {
            const href = item.getAttribute('href');
            const title = item.querySelector('.chapter-tt p')?.innerText || 'Untitled Chapter';
            links.push({ href: `https://www.joara.com${href}`, title });
        });
        return links.reverse(); // Reverse to start from the first chapter
    });

    if (chapterLinks.length === 0) {
        console.error('No chapter links found.');
        await browser.close();
        return;
    }

    console.log(`Found ${chapterLinks.length} chapters.`);

    let compiledText = '';
    const epubContent = [];

    // Fetch and compile chapter content
    let chapterCounter = 0;
    for (const [index, chapter] of chapterLinks.entries()) {
        console.log(`Fetching chapter ${index + 1}: ${chapter.title}`);

        // Retry mechanism for loading chapter content
        let chapterRetryCount = 0;
        const maxChapterRetries = 3;

        while (chapterRetryCount < maxChapterRetries) {
            try {
                // Ensure the page is still valid before navigating
                if (page.isClosed()) {
                    console.log('Page is closed. Reinitializing...');
                    page = await browser.newPage();
                    await setupPage(page); // Re-apply user agent and other settings
                }

                await page.goto(chapter.href, { waitUntil: 'networkidle2', timeout: 60000 });

                // Wait for the page to fully load and check for CAPTCHA
                console.log('Waiting for chapter page to fully load...');
                await page.waitForSelector('body', { timeout: 30000 });
                await new Promise((resolve) => setTimeout(resolve, 5000));

                const isCaptchaPage = await page.evaluate(() => {
                    return document.querySelector('.recaptcha-page') !== null;
                });

                if (isCaptchaPage) {
                    // Handle CAPTCHA by reloading in non-headless mode
                    const { newBrowser, newPage } = await handleCaptcha(page, browser, chapter);
                    browser = newBrowser;
                    page = newPage;

                    // Re-fetch the chapter content after solving CAPTCHA
                    await page.goto(chapter.href, { waitUntil: 'networkidle2', timeout: 60000 });
                    await page.waitForSelector('body', { timeout: 30000 });
                    await new Promise((resolve) => setTimeout(resolve, 5000));
                }

                // Wait for the chapter text to load
                await page.waitForSelector('ol.text-wrap.no-print', { timeout: 30000 });

                // Extract chapter text
                const chapterText = await page.evaluate(() => {
                    const chapterTextElement = document.querySelector('ol.text-wrap.no-print');
                    return chapterTextElement ? chapterTextElement.innerText || chapterTextElement.textContent : null;
                });

                if (chapterText) {
                    compiledText += `\n\n=== ${chapter.title} ===\n\n${chapterText}`;
                    epubContent.push({
                        title: chapter.title,
                        data: `<h1>${chapter.title}</h1><p>${chapterText.replace(/\n/g, '</p><p>')}</p>`,
                    });
                    break; // Exit the retry loop if chapter text is successfully fetched
                }
            } catch (error) {
                chapterRetryCount++;
                console.error(`Failed to load chapter ${chapter.title}. Attempt ${chapterRetryCount} of ${maxChapterRetries}.`);
                if (chapterRetryCount >= maxChapterRetries) {
                    console.error(`Failed to load chapter ${chapter.title} after ${maxChapterRetries} attempts. Skipping...`);
                    break; // Exit the retry loop after max retries
                }

                // Reload the page and retry
                await page.reload({ waitUntil: 'networkidle2' });
            }
        }

        // Increment chapter counter
        chapterCounter++;

        // Check if cooldown is needed
        if (cooldownChapters && cooldownMinutes && chapterCounter % cooldownChapters === 0) {
            console.log(`Fetched ${cooldownChapters} chapters. Cooling down for ${cooldownMinutes} minutes.`);
            await new Promise((resolve) => setTimeout(resolve, cooldownMinutes * 60 * 1000));
        }

        // Wait for the specified time before fetching the next chapter
        console.log(`Waiting ${waitTime / 1000} seconds before fetching the next chapter...`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
    }

    // Save the compiled text to a file
    const txtFilename = `joara_${sanitizedBookName}_${sanitizedAuthorName}_${Date.now()}.txt`;
    fs.writeFileSync(txtFilename, compiledText, 'utf-8');
    console.log(`Text file saved as ${txtFilename}`);

    // Generate EPUB file
    const epubFilename = `joara_${sanitizedBookName}_${sanitizedAuthorName}_${Date.now()}.epub`;
    const epubOptions = {
        title: bookName,
        author: authorName,
        content: epubContent,
    };

    try {
        const epub = new Epub(epubOptions, epubFilename);
        await new Promise((resolve, reject) => {
            epub.promise
                .then(() => {
                    console.log(`EPUB file saved as ${epubFilename}`);
                    resolve();
                })
                .catch((error) => {
                    console.error('Failed to generate EPUB file:', error);
                    reject(error);
                });
        });
    } catch (error) {
        console.error('Error during EPUB generation:', error);
    } finally {
        // Close the browser after EPUB generation
        await browser.close();
    }
}

// Helper function to auto-scroll the page
async function autoScroll(page) {
    await page.evaluate(async () => {
        await new Promise((resolve) => {
            let totalHeight = 0;
            const distance = 100; // Scroll distance in pixels
            const timer = setInterval(() => {
                const scrollHeight = document.body.scrollHeight;
                window.scrollBy(0, distance);
                totalHeight += distance;

                if (totalHeight >= scrollHeight) {
                    clearInterval(timer);
                    resolve();
                }
            }, 100); // Scroll every 100ms
        });
    });
}

// Main function to handle command-line arguments
async function main() {
    const inputs = process.argv.slice(2); // Get book IDs or URLs from command-line arguments

    // Check for -help argument
    if (inputs.includes('-help')) {
        displayHelp();
        return;
    }

    if (inputs.length === 0) {
        console.error('Please provide at least one book ID or URL.');
        displayHelp();
        return;
    }

    // Parse wait time arguments
    let waitTime = 5000; // Default wait time between chapters (5 seconds)
    let waitBetweenBooks = 0; // Default wait time between books (0 milliseconds)
    let cooldownChapters, cooldownMinutes;
    const bookIds = [];

    const args = [...inputs];
    while (args.length > 0) {
        const arg = args.shift();
        switch (arg) {
            case '-waitTime':
                const waitTimeArg = args.shift();
                if (waitTimeArg !== undefined) {
                    const waitTimeValue = parseInt(waitTimeArg, 10);
                    if (!isNaN(waitTimeValue) && waitTimeValue > 0) {
                        waitTime = waitTimeValue; // in milliseconds
                    } else {
                        console.error('Invalid value for -waitTime. Using default.');
                    }
                } else {
                    console.error('Missing value for -waitTime. Using default.');
                }
                break;
            case '-bookWait':
                const waitBetweenBooksArg = args.shift();
                if (waitBetweenBooksArg !== undefined) {
                    const waitBetweenBooksValue = parseInt(waitBetweenBooksArg, 10);
                    if (!isNaN(waitBetweenBooksValue) && waitBetweenBooksValue >= 0) {
                        waitBetweenBooks = waitBetweenBooksValue; // in milliseconds
                    } else {
                        console.error('Invalid value for -bookWait. Using default.');
                    }
                } else {
                    console.error('Missing value for -bookWait. Using default.');
                }
                break;
            case '-cooldown':
                const nChaptersArg = args.shift();
                const minutesArg = args.shift();
                if (nChaptersArg !== undefined && minutesArg !== undefined) {
                    const nChapters = parseInt(nChaptersArg, 10);
                    const minutes = parseInt(minutesArg, 10);
                    if (!isNaN(nChapters) && nChapters > 0 && !isNaN(minutes) && minutes >= 0) {
                        cooldownChapters = nChapters;
                        cooldownMinutes = minutes;
                    } else {
                        console.error('Invalid values for -cooldown. Ignoring cooldown.');
                    }
                } else {
                    console.error('Missing values for -cooldown. Ignoring cooldown.');
                }
                break;
            default:
                // Check if the input is a URL
                const urlPattern = /https?:\/\/www\.joara\.com\/book\/(\d+)/;
                const match = arg.match(urlPattern);
                if (match) {
                    bookIds.push(match[1]); // Extract the book ID from the URL
                } else if (!isNaN(arg)) {
                    bookIds.push(arg); // Use the input directly as the book ID
                } else {
                    console.error(`Invalid book ID or URL: ${arg}`);
                }
                break;
        }
    }

    if (bookIds.length === 0) {
        console.error('No valid book IDs or URLs provided.');
        displayHelp();
        return;
    }

    // Scrape each book
    for (const bookId of bookIds) {
        await scrapeBook(bookId, waitTime, cooldownChapters, cooldownMinutes);

        if (waitBetweenBooks > 0) {
            console.log(`Waiting ${waitBetweenBooks / 1000} seconds before starting the next book...`);
            await new Promise((resolve) => setTimeout(resolve, waitBetweenBooks));
        }
    }
}

// Run the script
main().catch((error) => console.error('Error:', error));
