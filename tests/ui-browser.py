"""Run: npm run dev, then python tests/ui-browser.py. No network to Google/API."""
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / '.impeccable' / 'review'
OUT.mkdir(parents=True, exist_ok=True)
MOCK = """() => {
  window.__calls = [];
  const fill = { mode:'random',aiText:false,delay:350,checkboxCount:4,autoNext:false,autoSubmit:false,skipAnswered:true,preview:true,rules:[],personalContext:'',answerLength:'medium',language:'auto',dark:false };
  const api = {provider:'openai',baseUrl:'https://api.openai.com/v1',apiKey:'',model:'gpt-4o-mini',temperature:0.7,maxTokens:300,systemPrompt:'',timeout:20000,retryCount:1};
  const question = {id:'fixture',title:'Bạn thường sử dụng biểu mẫu cho mục đích nào?',kind:'radio',choices:[{id:'test',label:'Kiểm thử'},{id:'research',label:'Nghiên cứu'}],rows:[],answered:false,required:true};
  const state = {phase:'idle',page:1,completed:0,failed:0,logs:[],questions:[question],answers:[]};
  window.chrome = {
    runtime:{id:'ui-fixture',sendMessage:async m=>{window.__calls.push(m);return {ok:true,data:m.type==='GET_FILL'?fill:m.type==='GET_API'?api:true}},openOptionsPage:async()=>{}},
    tabs:{query:async()=>[{id:7,url:'https://docs.google.com/forms/d/e/fixture/viewform'}],sendMessage:async(_,m)=>{window.__calls.push(m);if(m.type==='START'){state.phase='preview';state.answers=[{questionId:'fixture',choices:['test']}]};if(m.type==='RESET')state.phase='idle';return {ok:true,data:{...state}}}},
    scripting:{executeScript:async()=>{}},permissions:{request:async()=>true}
  };
}"""

def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Horizontal overflow'

def shot(page, name):
    page.screenshot(path=str(OUT / name), full_page=True)
    no_overflow(page)

with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440,'height':1000}, reduced_motion='reduce')
    context.add_init_script(f'({MOCK})()')
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.goto('http://127.0.0.1:5173/options.html', wait_until='networkidle')
    shot(page, 'desktop.png')
    advanced = page.locator('details').filter(has=page.get_by_text('Tùy chọn AI nâng cao', exact=True))
    assert not advanced.evaluate('(e)=>e.open')
    advanced.locator('summary').click()
    page.locator('#temperature').fill('0.9')
    page.get_by_role('button', name='Lưu cấu hình API', exact=True).click()
    assert page.evaluate("__calls.some(m=>m.type==='SAVE_API' && m.settings.temperature===0.9)")
    page.locator('#mode').select_option('rules')
    assert page.locator('.rules-section').evaluate('(e)=>e.open')
    page.get_by_role('button', name='+ Thêm quy tắc', exact=True).click()
    page.locator('#rule-contains-0').fill('Mục đích')
    page.locator('#rule-answers-0').fill('Kiểm thử')
    page.get_by_role('button', name='Lưu cách điền', exact=True).click()
    assert page.evaluate("__calls.some(m=>m.type==='SAVE_FILL' && m.settings.rules.length===1)")
    page.set_viewport_size({'width':375,'height':900})
    page.reload(wait_until='networkidle')
    shot(page, 'mobile.png')
    page.locator('label.check-row').filter(has_text='Giao diện tối').click()
    shot(page, 'settings-dark-mobile.png')
    page.set_viewport_size({'width':600,'height':600})
    page.goto('http://127.0.0.1:5173/popup.html', wait_until='networkidle')
    shot(page, 'popup.png')
    assert not page.locator('.auto-fill-options').evaluate('(e)=>e.open')
    page.get_by_role('button', name='Chuẩn bị câu trả lời', exact=True).click()
    page.locator('#answer-fixture').wait_for()
    shot(page, 'popup-preview.png')
    page.set_viewport_size({'width':320,'height':600})
    shot(page, 'popup-narrow.png')
    # Mount the actual toolbar module against an inert engine, never a real form.
    page.set_viewport_size({'width':1000,'height':700})
    page.goto('http://127.0.0.1:5173/options.html', wait_until='networkidle')
    page.evaluate("""async () => {
      const {mountFormToolbar} = await import('/src/content/form-toolbar.ts');
      window.__toolbarEngine = {state:{phase:'idle',page:1,completed:0,logs:[]},stop(){this.state.phase='stopped'},start(){}};
      mountFormToolbar(window.__toolbarEngine);
    }""")
    page.locator('#forms-ai-toolbar').screenshot(path=str(OUT/'toolbar.png'))
    page.evaluate("__toolbarEngine.state={phase:'filling',page:2,completed:8,logs:[]}")
    # Wait for the real toolbar's existing 300ms render interval.
    page.wait_for_timeout(350)
    page.locator('#forms-ai-toolbar').screenshot(path=str(OUT/'toolbar-working.png'))
    page.set_viewport_size({'width':320,'height':600})
    shot(page, 'toolbar-narrow.png')
    assert not errors, errors
    browser.close()
print('Browser UI: save, disclosures, rule editor, preview, dark mode, toolbar and widths passed.')
