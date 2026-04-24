import asyncio
from playwright.async_api import async_playwright
import os
import time

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={'width': 450, 'height': 800})
        await page.goto('http://localhost:8001')
        await page.click('#start-button')

        # ボールが落ちてくるのを待つ
        time.sleep(4)

        # 画面中央下部あたりにボールがあるはずなので、そこをドラッグしてみる
        # 実際にはボールの位置を特定するのが望ましいが、キャンバス内なので座標で指定
        await page.mouse.move(225, 700)
        await page.mouse.down()
        await page.mouse.move(225, 400, steps=10)
        await page.screenshot(path='screenshot_drag.png')
        await page.mouse.up()

        await browser.close()

if __name__ == "__main__":
    import http.server
    import threading
    import socketserver

    PORT = 8001
    Handler = http.server.SimpleHTTPRequestHandler
    httpd = socketserver.TCPServer(("", PORT), Handler)

    server_thread = threading.Thread(target=httpd.serve_forever)
    server_thread.daemon = True
    server_thread.start()

    asyncio.run(main())

    httpd.shutdown()
