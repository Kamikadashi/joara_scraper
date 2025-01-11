# Joara Novel Scraper

This script is a web scraper built with Puppeteer and Node.js that automatically downloads and compiles chapters from Joara novels into `.txt` and `.epub` formats. It includes options for custom wait times, cooldowns, CAPTCHA handling, and waits between scraping multiple books.

---

## Features
- **Scrape Chapters**: Downloads all chapters of a Joara novel.
- **Save as TXT**: Compiles chapters into a `.txt` file.
- **Generate EPUB**: Creates an `.epub` file for easy reading on e-readers.
- **Custom Wait Times**: Set a delay between chapter downloads.
- **Cooldown**: Add a cooldown period after a specified number of chapters.
- **Wait Between Books**: Specify a delay between scraping multiple books.
- **CAPTCHA Handling**: Automatically prompts for manual CAPTCHA solving when detected.

---

## Prerequisites
- [Node.js](https://nodejs.org/) installed.
- System dependencies for Puppeteer (see below).

### Install System Dependencies
#### **Linux (Ubuntu/Debian)**:
```bash
sudo apt-get update
sudo apt-get install -y libgbm-dev libx11-xcb1 libxcomposite1 libxcursor1 libxdamage1 libxi6 libxtst6 libnss3 libatk1.0-0 libatk-bridge2.0-0 libgdk-pixbuf2.0-0 libgtk-3-0 libasound2
```

#### **macOS**:
Ensure Xcode Command Line Tools are installed:
```bash
xcode-select --install
```

---

## Installation
1. Clone this repository or download the script.
2. Install Node.js dependencies:
   ```bash
   npm install puppeteer epub-gen
   ```

---

## Usage
Run the script with the following command:
```bash
node joara_scraper.js <bookId|url> [options]
```

### Options
- `-waitTime <ms>`: Wait time in milliseconds between chapters (default: `5000`).
- `-bookWait <ms>`: Wait time in milliseconds between scraping multiple books (default: `0`).
- `-cooldown <n> <m>`: After every `n` chapters, cooldown for `m` minutes.
- `-help`: Display help message.

### Examples
- Scrape a book with ID `1792100`:
  ```bash
  node joara_scraper.js 1792100
  ```
- Scrape with a custom wait time and cooldown:
  ```bash
  node joara_scraper.js 1792100 -waitTime 3000 -cooldown 25 5
  ```
- Scrape multiple books with a wait time between them:
  ```bash
  node joara_scraper.js 1792100 1792101 -bookWait 10000
  ```
- Scrape using a URL:
  ```bash
  node joara_scraper.js https://www.joara.com/book/1792100
  ```

---

## Output
- A `.txt` file containing all chapters.
- An `.epub` file for e-reader compatibility.

Files are saved in the same directory as the script with names like:
```
joara_BookName_AuthorName_<timestamp>.txt
joara_BookName_AuthorName_<timestamp>.epub
```

---

## Notes
- Ensure you have a stable internet connection.
- If CAPTCHA is detected, the script will prompt you to solve it manually in a non-headless browser.
- Avoid excessive scraping to prevent being blocked by Joara.

---

## License
This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

## Support
For issues or questions, please open an issue on GitHub.
