import asyncio
from playwright.async_api import async_playwright
import os
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 450, 'height': 800})

        # スタート画面の確認
        await page.goto('http://localhost:8000')
        await page.wait_for_selector('#start-button')
        await page.screenshot(path='screenshot_start.png')

        # ゲーム開始
        await page.click('#start-button')
        time.sleep(5) # ボールがいくつか落ちるのを待つ
        await page.screenshot(path='screenshot_gameplay.png')

        await browser.close()

if __name__ == "__main__":
    import http.server
    import threading
    import socketserver

    PORT = 8000
    Handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(("", PORT), Handler)

    server_thread = threading.Thread(target=httpd.serve_forever)
    server_thread.daemon = True
    server_thread.start()

    asyncio.run(main())

    httpd.shutdown()
