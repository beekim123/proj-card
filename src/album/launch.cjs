const {app,BrowserWindow,Menu}=require('electron');
const path=require('node:path');
app.setName('异能卡牌');
if(process.env.NIGHTWOOD_TEST_PROFILE)app.setPath('userData',path.resolve(process.env.NIGHTWOOD_TEST_PROFILE));
let win;
if(!app.requestSingleInstanceLock()){console.log('游戏已打开时，请从大厅进入卡册。');app.quit();}else app.whenReady().then(async()=>{
 Menu.setApplicationMenu(null);win=new BrowserWindow({title:'夜林 · 系列卡册',width:1280,height:780,minWidth:520,minHeight:400,backgroundColor:'#16272f',webPreferences:{sandbox:true,contextIsolation:true}});
 await win.loadFile(path.join(__dirname,'../../album.html'),process.argv.includes('--observe')?{query:{observe:'1'}}:{});});
app.on('window-all-closed',()=>app.quit());
