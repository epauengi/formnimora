"""Optional regression: python tests/browser-navigation.py (requires Playwright + Edge). No requests reach Google."""
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')
import tempfile
import time
import json
from playwright.sync_api import sync_playwright

root = Path(__file__).resolve().parents[1]
page_one = '''<div role="listitem"><h2 role="heading">Phần 1</h2><div role="radio" aria-label="A" aria-checked="false" onclick="this.setAttribute('aria-checked','true')">A</div></div><div role="button" aria-label="Tiếp" data-value="Tiếp" onclick="location.href='/forms/d/e/navigation-fixture/formResponse'"><span>Tiếp</span></div>'''
page_two = '''<div role="listitem"><div role="heading" aria-level="2">PHẦN 1. HOẠT ĐỘNG VÀ NHU CẦU</div></div><div role="listitem"><h2 role="heading">Phần 2</h2><div role="radio" aria-label="B" aria-checked="false" onclick="this.setAttribute('aria-checked','true')">B</div></div><div role="button" aria-label="Gửi" data-value="Gửi" onclick="document.body.innerHTML='<p>Câu trả lời của bạn đã được ghi lại.</p>'; window.submits=(window.submits||0)+1"><span>Gửi</span></div>'''
profile_root = Path(tempfile.gettempdir()) / 'opencode'
profile_root.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory(prefix='forms-navigation-', dir=profile_root) as profile, sync_playwright() as p:
    context = p.chromium.launch_persistent_context(profile, channel='msedge', headless=True, args=[f'--disable-extensions-except={root / "dist"}', f'--load-extension={root / "dist"}'])
    try:
        worker = context.service_workers[0] if context.service_workers else context.wait_for_event('serviceworker')
        extension_id = worker.url.split('/')[2]
        destination_loads = 0
        def serve_form(route):
            global destination_loads
            destination = 'formResponse' in route.request.url
            body = page_one
            if destination:
                destination_loads += 1
                if destination_loads == 1:
                    time.sleep(16)  # First load exceeds the old document's navigation timeout.
                # Send mounts first; content script must wait for the later questions.
                question, navigation = page_two.split('<div role="button"', 1)
                body = '<body><div role="button"' + navigation + '<script>setTimeout(() => document.body.insertAdjacentHTML("afterbegin", ' + json.dumps(question) + '), 700)</script></body>'
            route.fulfill(content_type='text/html; charset=utf-8', body=body)
        context.route('https://docs.google.com/forms/d/e/navigation-fixture/**', serve_form)
        form = context.new_page()
        form.goto('https://docs.google.com/forms/d/e/navigation-fixture/viewform')
        # Locate the closed shadow control through browser debugging; page JS cannot access it.
        cdp = context.new_cdp_session(form)
        def toolbar_button():
            tree = cdp.send('DOM.getDocument', {'depth': -1, 'pierce': True})['root']
            def walk(node):
                if node.get('attributes', [])[0:2] == ['id', 'forms-ai-toolbar']:
                    return node
                for child in node.get('children', []) + node.get('shadowRoots', []):
                    found = walk(child)
                    if found:
                        return found
            host = walk(tree)
            assert host, 'Toolbar missing'
            def find_button(node):
                if node.get('nodeName') == 'BUTTON':
                    return node['nodeId']
                for child in node.get('children', []) + node.get('shadowRoots', []):
                    found = find_button(child)
                    if found:
                        return found
            return find_button(host)
        def click_toolbar():
            quad = cdp.send('DOM.getBoxModel', {'nodeId': toolbar_button()})['model']['border']
            form.mouse.click((quad[0] + quad[4]) / 2, (quad[1] + quad[5]) / 2)
        # First accepted run on a fresh install, before opening extension UI or saving settings.
        form.wait_for_selector('#forms-ai-toolbar')
        form.once('dialog', lambda dialog: dialog.accept())
        click_toolbar()
        form.wait_for_url('**/formResponse', timeout=30000)
        form.get_by_text('Câu trả lời của bạn đã được ghi lại.', exact=True).wait_for(timeout=15000)
        assert form.evaluate('window.submits') == 1
        form.goto('https://docs.google.com/forms/d/e/navigation-fixture/viewform')
        options = context.new_page()
        options.goto(f'chrome-extension://{extension_id}/options.html')
        options.wait_for_selector('#model:enabled')
        # Start without opening the popup, scripting injection or toolbar activeTab grant.
        options.wait_for_function('''async () => {
          const tab = (await chrome.tabs.query({})).find(t => t.url?.includes('navigation-fixture'));
          if (!tab) return false;
          try { return (await chrome.tabs.sendMessage(tab.id,{type:'STATUS'})).ok; } catch { return false; }
        }''')
        form.bring_to_front()
        form.wait_for_selector('#forms-ai-toolbar')
        assert form.evaluate("document.querySelector('#forms-ai-toolbar').shadowRoot") is None
        form.once('dialog', lambda dialog: dialog.dismiss())
        click_toolbar()
        assert options.evaluate('''async () => {
          const tab = (await chrome.tabs.query({})).find(t => t.url?.includes('navigation-fixture'));
          return (await chrome.tabs.sendMessage(tab.id,{type:'STATUS'})).data.phase;
        }''') == 'idle'
        # Stop from the in-page toolbar before it can navigate or submit.
        options.evaluate('''async () => {
          const fill = (await chrome.runtime.sendMessage({type:'GET_FILL'})).data;
          await chrome.runtime.sendMessage({type:'SAVE_FILL',settings:{...fill,delay:3000}});
        }''')
        form.once('dialog', lambda dialog: dialog.accept())
        click_toolbar()
        form.wait_for_selector('[role="radio"][aria-checked="true"]')
        click_toolbar()
        assert options.evaluate('''async () => {
          const tab = (await chrome.tabs.query({})).find(t => t.url?.includes('navigation-fixture'));
          return (await chrome.tabs.sendMessage(tab.id,{type:'STATUS'})).data.phase;
        }''') == 'stopped'
        assert 'viewform' in form.url
        form.reload()
        form.wait_for_selector('#forms-ai-toolbar')
        toolbar_button()
        form.screenshot(path=str(Path(tempfile.gettempdir()) / 'opencode' / 'forms-toolbar-desktop.png'))
        form.set_viewport_size({'width': 375, 'height': 700})
        box = cdp.send('DOM.getBoxModel', {'nodeId': toolbar_button()})['model']['border']
        assert min(box[0::2]) >= 0 and max(box[0::2]) <= 375
        form.screenshot(path=str(Path(tempfile.gettempdir()) / 'opencode' / 'forms-toolbar-mobile.png'))
        options.evaluate('''async () => {
          const fill = (await chrome.runtime.sendMessage({type:'GET_FILL'})).data;
          await chrome.runtime.sendMessage({type:'SAVE_FILL',settings:{...fill,delay:0}});
        }''')
        form.once('dialog', lambda dialog: dialog.accept())
        click_toolbar()
        try:
            form.wait_for_url('**/formResponse', timeout=30000)
        except Exception:
            print('ENGINE', options.evaluate('''async () => { const tab = (await chrome.tabs.query({})).find(t => t.url?.includes('navigation-fixture')); return await chrome.tabs.sendMessage(tab.id,{type:'STATUS'}); }'''))
            print('DOM', form.content())
            raise
        form.get_by_text('Câu trả lời của bạn đã được ghi lại.', exact=True).wait_for(timeout=15000)
        assert form.evaluate('window.submits') == 1
        options.wait_for_function('''async () => {
          const tab = (await chrome.tabs.query({})).find(t => t.url?.includes('navigation-fixture'));
          const result = await chrome.tabs.sendMessage(tab.id,{type:'STATUS'});
          return result.data?.phase === 'done' && result.data.page === 2 && result.data.completed === 2;
        }''')
        print('PASS: fresh first run, 16s navigation, delayed destination DOM, repeated run, checkpoint resume, decomposed Forms captions, exactly one Submit per run; no real Google requests.')
    finally:
        context.close()
