extends RefCounted
## Headless native UI smoke. The caller must set GEMCARD_SAVE_DIR to artifacts/.
const Main: Script = preload("res://scripts/app/game.gd")
const Run: Script = preload("res://rules/run.gd")
const Card: Script = preload("res://scripts/ui/card_view.gd")

static func run(tree: SceneTree) -> Dictionary:
	var result: Dictionary = {"passed": 0, "failed": [], "names": []}
	if not OS.get_environment("GEMCARD_SAVE_DIR").contains("artifacts/"):
		_check(result, false, "UI smoke需要artifacts隔离存档目录")
		return result
	var app: Control = Main.new()
	app.fixed_seed = 1979
	tree.root.add_child(app)
	await tree.process_frame
	app.go_home()
	_check(result, app.screen == "home" and app.scene.get_child_count() > 0, "首页原生节点可创建")
	var record_label: Label = app._label("还没有纪录",app.layout.title.record,28,null,true)
	await tree.process_frame
	_check(result, record_label.size.y <= float(app.layout.title.record.h)+0.01, "先定位再填文字不会撑高首页纪录框")
	_check(result, record_label.position.y+record_label.size.y <= app.layout.height, "首页纪录文字框完整入屏")
	record_label.queue_free()
	app.prefs.sound = false
	app.sound.configure(app.prefs)
	app.animations.clear()
	app.clock.reset()
	var stepped: Array[int] = [0]
	app._animate(100.0, func(_fraction: float) -> void: stepped[0] += 1, Callable(), 200.0)
	app._process(0.0)
	_check(result, stepped[0] == 0, "延迟动画在start之前不执行step")
	app.animations.clear()
	app.start_practice()
	await tree.process_frame
	var hand_before: int = app.game_state.hand.size()
	app.play_card(0)
	_check(result, app.game_state.row.size() == 1, "练习点牌进入排牌区")
	app.undo_card()
	_check(result, app.game_state.row.is_empty() and app.game_state.hand.size() == hand_before, "练习撤回恢复手牌")
	app._preview_card(app.game_state.hand[0], 600.0)
	_check(result, app.preview != null, "手牌放大预览及规则预估")
	app._hide_preview()
	for method: String in ["_show_rules", "_show_deck", "_show_settings"]:
		app.call(method)
		_check(result, app.modal != null, "练习弹窗：" + method)
		app._close_modal()
	app.start_adventure()
	await tree.process_frame
	_check(result, app.run_state.phase == "relic", "冒险开局宝物界面")
	var relic_body: Label=app.scene.find_child("RelicDescription0",true,false)
	_check(result,relic_body!=null and relic_body.clip_text and relic_body.get_parent().clip_contents,"宝物描述限制在三行和卡片内部")
	_check(result, _label_contains(app.scene,"第 1 仗 · 第 1 回合"), "选宝物阶段也显示冒险回合计数")
	Run.choose_relic(app.run_state, 0)
	app.game_state = app.run_state.game
	app._render()
	_check(result, app.monster != null and app.hand_nodes.size() == app.game_state.hand.size(), "冒险战斗及手牌节点")
	_check(result,app.hp_fill.get_parent().name=="HpSlot" and app.hp_fill.get_parent().get_parent().name=="HpFrame","血条填充位于原画框内部且绘制在其上")
	app.play_card(0)
	_check(result, app.game_state.row.size() == 1, "冒险排牌调用原规则")
	app.undo_card()
	_check(result, app.game_state.row.is_empty(), "冒险撤回调用原规则")
	app._show_monster()
	_check(result, app.modal != null, "怪介绍弹窗")
	app._close_modal()
	app._show_growth(0)
	_check(result, app.modal != null, "成长详情弹窗")
	app._close_modal()
	app.debug_enabled = true
	app._show_settings()
	_check(result, app.modal != null, "debug设置和全部测试入口可创建")
	app._close_modal()
	Run.debug_set_monster_hp(app.run_state, 0)
	Run.end_run_turn(app.run_state)
	app.game_state = app.run_state.game
	app._render()
	_check(result, app.run_state.phase == "loot" and app.run_state.loot.size() >= 3, "战后战利品可展示")
	_check(result, _art_count(app.scene,"card_back")>=app.run_state.loot.size(), "战利品出场先显示牌背再翻面")
	await tree.create_timer(1.28).timeout
	await tree.process_frame
	_check(result, _art_count(app.scene,"card_back")>0 and _art_count(app.scene,"card_back")<app.loot_cards.size() and app.loot_cards[0].scale.x<float(app.layout.loot.scale), "战利品在1100ms后逐张翻面并于中点露出正面")
	await tree.create_timer(0.6).timeout
	_check(result, _art_count(app.scene,"card_back")==0, "战利品牌背在全部翻面后移除")
	app._take_loot(-1)
	_check(result, app.run_state.phase != "loot", "不拿战利品进入下一阶段")
	app._reset()
	Run.debug_jump_room(app.run_state, 2)
	app.game_state = app.run_state.game
	app._render()
	_check(result, app.run_state.phase == "doors" and Run.door_options(app.run_state).size() == 2, "双门阶段可展示")
	app.selected_door = 0
	app._render()
	app._enter_door()
	_check(result, app.run_state.phase == "battle", "进选中门调用原规则")
	app._reset()
	Run.debug_enter_shop(app.run_state)
	app.game_state = app.run_state.game
	app._render()
	_check(result, app.run_state.phase == "shop", "工坊入口和操作页")
	app.shop_mode = "drop"
	app._render()
	_check(result, _card_count(app.scene) > 0, "工坊扔牌页实际生成卡牌网格")
	var cards_before: int = app.run_state.cards.size()
	app.shop_selected = [app.run_state.cards[0].id]
	app._confirm_shop()
	_check(result, app.run_state.cards.size() == cards_before - 1, "工坊扔牌调用原规则")
	await tree.create_timer(1.2).timeout
	Run.debug_enter_shop(app.run_state)
	app.game_state = app.run_state.game
	app.shop_mode = "copy"
	app._render()
	_check(result, _card_count(app.scene) > 0, "工坊抄牌页实际生成卡牌网格")
	cards_before = app.run_state.cards.size()
	app.shop_selected = [app.run_state.cards[0].id]
	app._confirm_shop()
	_check(result, app.run_state.cards.size() == cards_before + 1, "工坊抄牌调用原规则")
	await tree.create_timer(1.2).timeout
	Run.debug_jump_room(app.run_state, 6)
	Run.debug_set_monster_hp(app.run_state, 0)
	Run.end_run_turn(app.run_state)
	Run.choose_relic(app.run_state, 0)
	Run.choose_act_exit(app.run_state, "retreat")
	app.game_state = app.run_state.game
	app._persist()
	app._render()
	_check(result, app.run_state.result != null and app.run_state.result.outcome == "retreat", "安全带走结算界面与纪录")
	var rows: Node=app.scene.find_child("ResultRows",true,false)
	_check(result, rows!=null and rows.get_child_count()>=9, "结算页保留独立对齐行并新增收藏信息")
	await tree.process_frame
	var name_label: Label=rows.get_child(0).get_child(0)
	_check(result,name_label.autowrap_mode==TextServer.AUTOWRAP_OFF and name_label.size.x>=app.art.font.get_string_size(name_label.text,HORIZONTAL_ALIGNMENT_LEFT,-1,28).x-0.1,"结算行名保留自然最小宽度不逐字竖排")
	_check(result, app.scene.find_child("ResultBanner",true,false)!=null and app.scene.find_child("ResultBanner",true,false).z_index>0, "结算横幅绘制在面板之上")
	var shot: Dictionary=app._capture_snapshot()
	_check(result, shot.screen=="adventure" and shot.run.result.recordsApplied and shot.game==app.game_state, "终局截图旁车状态包含已记账原规则状态")
	var best_number: Label=app.scene.find_child("BestTurnValue",true,false)
	_check(result, best_number!=null and best_number.horizontal_alignment==HORIZONTAL_ALIGNMENT_RIGHT, "结算数值独立右对齐")
	await tree.create_timer(1.3).timeout
	_check(result, best_number.text=="%s   第 %d 仗" % [app.C.format_full(app.run_state.result.bestTurn),app.run_state.result.bestFight], "结算逐步计数完成后恢复精确全量数值")
	var badge_rows: VBoxContainer=VBoxContainer.new(); app.scene.add_child(badge_rows)
	app._result_row(badge_rows,"最高一回合","123,456",true)
	var record_badge: Label=badge_rows.find_child("NewRecord",true,false)
	_check(result, record_badge!=null and record_badge.text=="新纪录" and record_badge.get_theme_font_size("font_size")==26, "新纪录作为独立26号徽记展示")
	app.start_adventure()
	Run.choose_relic(app.run_state, 0)
	Run.abandon_run(app.run_state)
	app.game_state = app.run_state.game
	app._persist()
	app._render()
	_check(result, app.run_state.result != null and app.run_state.result.outcome == "defeat", "失败结算界面与纪录")
	app.forced_layout = "portrait"
	app._resize()
	_check(result, app.layout.name == "portrait", "竖屏原生布局可重建")
	app.forced_layout = "landscape"
	app._resize()
	_check(result, app.layout.name == "landscape", "横屏原生布局可重建")
	app.art_mode = true
	app._render()
	_check(result, app.scene.get_child(0).asset_buttons.size() == 89, "主入口打开完整素材检查器")
	app.inspect_id = "mon_clock"
	app._render()
	_check(result, app.scene.get_child(0).preview.art_id == "mon_clock", "检查器inspect-id可选择座钟")
	app.inspect_id = "ui_rainbow_slot"
	app._render()
	_check(result, app.scene.get_child(0).previews.size() == 6, "检查器彩虹六色同屏")
	_check(result, app._capture_snapshot()=={"art":"ui_rainbow_slot"}, "素材截图旁车只记录所选素材")
	app.art_mode = false
	app.inspect_id = ""
	app.debug_enabled = true
	app.start_practice()
	app._reset()
	app.debug_deal([1, 2, 4, 3, 6, 5, 7, 0, 1])
	var key: InputEventKey = InputEventKey.new(); key.pressed = true; key.keycode = KEY_9
	app._input(key)
	_check(result, app.game_state.row.size() == 1, "战斗快捷键9可打出第九张")
	app.undo_card()
	var origin_node: Control = app.hand_nodes[app.game_state.hand[0].id]
	var at: Vector2 = origin_node.get_meta("layout_origin") + Vector2(40, 100)
	var down: InputEventScreenTouch = InputEventScreenTouch.new(); down.index = 2; down.pressed = true; down.position = app.stage.get_global_transform() * at
	app._hand_input(down, 0, origin_node)
	_check(result, is_equal_approx(origin_node.position.y,float(app.drag.raw_origin.y)-110.0) and origin_node.scale.is_equal_approx(app.drag.original_scale*1.25), "按住手牌上抬110并放大1.25倍")
	var up: InputEventScreenTouch = InputEventScreenTouch.new(); up.index = 2; up.pressed = false; up.position = down.position
	app._input(up)
	_check(result, app.game_state.row.is_empty(), "触屏短按手牌不出牌")
	app._hand_input(down, 0, origin_node)
	var other_up: InputEventScreenTouch = InputEventScreenTouch.new(); other_up.index = 9; other_up.pressed = false; other_up.position = down.position
	app._input(other_up)
	_check(result, not app.drag.is_empty(), "第二根手指不会结束当前拖动")
	var positions: Array = app.L.hand_positions(app.game_state.hand.size(), app.layout)
	var next_id: int = app.game_state.hand[-1].id
	app._move_drag(Vector2(positions[-1].x+40, maxf(at.y, app.layout.hand.region.y+20)))
	_check(result, app.drag.id == next_id and not app.drag.moving, "触屏手牌区横滑切换所选卡")
	var legal: Vector2 = Vector2(300, 300)
	app._move_drag(legal)
	_check(result, app.drag.moving and is_equal_approx(app.drag.origin.y, legal.y-200.0-app.L.hand_size(app.layout).h/2.0), "触屏拖牌上移200设计像素")
	app._release_drag(legal)
	_check(result, app.game_state.row.size() == 1 and app.game_state.row[0].id == next_id, "上拖打出横滑后选中的卡")
	app.undo_card()
	_check(result, not app._can_drop(Vector2(-1, 100)) and not app._can_drop(Vector2(app.layout.width+1,100)) and not app._can_drop(Vector2(app.layout.undo.x+1,app.layout.undo.y+1)) and not app._can_drop(Vector2(app.layout.growth.centers[0].x,app.layout.growth.centers[0].y)), "屏外、工具栏和成长区不可放牌")
	origin_node = app.hand_nodes[app.game_state.hand[0].id]
	app._hand_input(down, 0, origin_node)
	app._cancel_drag()
	_check(result, app.drag.is_empty() and origin_node.visible, "取消和失焦恢复手牌")
	var holder: Control = Control.new(); app.scene.add_child(holder)
	var probe: Control = app._card(app.game_state.hand[0], holder, {"x":10,"y":20}, 0.4, true)
	_check(result, (probe.get_transform()*Vector2.ZERO).is_equal_approx(Vector2(10,20)), "缩放卡牌的真实Canvas左上角与布局对齐")
	probe.rotation_degrees = 12
	_check(result, (probe.get_transform()*Vector2(100,300)).is_equal_approx(Vector2(50,140)), "旋转手牌保持缩放后的底部中点锚")
	app.start_adventure(); Run.choose_relic(app.run_state,0); Run.debug_jump_room(app.run_state,3); app.game_state=app.run_state.game; app._render()
	var hp: Dictionary = app._hp_info()
	_check(result, hp.layers==2 and hp.layer==2 and hp.fraction==1.0 and not app.hp_text.text.contains("100,000"), "精英血条分两层并显示怪名而非血数字")
	app.run_state.monster.hp=float(app.run_state.monster.maxHp)/2.0; app.run_state.monster.turnStartHp=app.run_state.monster.maxHp
	app.game_state.row=[{}]
	hp=app._hp_info()
	_check(result, hp.layer==2 and hp.predictedLayer==1 and hp.ghostFrom==0.0, "预计打掉整层时斜纹覆盖当前层")
	app.run_state.monster.broken=true; hp=app._hp_info()
	_check(result, not hp.shownBroken and hp.willBreak, "排牌能打穿时怪还未进入发晕")
	app.striking=true; app.strike_hp=float(app.run_state.monster.maxHp)/2.0; hp=app._hp_info()
	_check(result, hp.layer==1 and hp.fraction==1.0, "血层边界使用H5的ceil减epsilon")
	app.striking=false; app.strike_hp=-1.0; app.game_state.row=[]
	Run.debug_jump_room(app.run_state,6); app.game_state=app.run_state.game; app._render(); hp=app._hp_info()
	_check(result, hp.layers==3 and hp.layer==3, "宝石龙显示三层血")
	_check(result, app._is_big_hit({"damage":1,"k":"white"}) and app._is_big_hit({"damage":1,"k":"plain","type":"hammer"}) and not app._is_big_hit({"damage":1,"k":"plain"}), "大击遵照凑白、锤子及怪血量阈值")
	var gaps: Array = app._strike_gaps(1)
	_check(result, gaps.size()==1 and gaps[0]==230.0, "单张连打也保留最后一张后间隔")
	app.animations.clear(); app.clock.reset(); app.clock.freeze(60.0)
	var wall: Array[float]=[0.0]; var art_time: Array[float]=[0.0]
	app._animate(100.0,func(t: float) -> void: wall[0]=t,Callable(),0.0,true)
	app._animate(100.0,func(t: float) -> void: art_time[0]=t)
	app._process(0.03)
	_check(result, wall[0]>0.0 and art_time[0]==0.0, "顿帧停素材时新闪白和退后仍按墙钟推进")
	app._reset(); app.debug_deal([1,2]); app.play_card(0)
	var turn_before: int=app.game_state.turn
	app.end_turn()
	_check(result, app.end_button.text=="打出去" and app.end_button.disabled and app.undo_button.disabled, "连打保持打出去文案且禁用结束和撤回按钮")
	await tree.process_frame
	await tree.process_frame
	_check(result, is_equal_approx(app.end_button.modulate.a,0.5) and app.end_button.get_theme_color("font_disabled_color")==Color(app.art.manifest.palette.ink) and app.end_button.material.get_shader_parameter("gray")==0.0, "主按钮禁用保持墨色且按CSS优先级仅半透明")
	_check(result, is_equal_approx(app.undo_button.modulate.a,0.5) and is_equal_approx(app.undo_button.material.get_shader_parameter("gray"),0.6), "圆按钮禁用使用当前H5的灰度0.6及半透明")
	app._skip_strike()
	_check(result, not app.striking and app.game_state.turn==turn_before+1 and app.game_state.row.is_empty(), "跳过连打立即结算且不再补播剩余命中")
	app._reset(); app.start_practice(); app.debug_deal([1,1]); app.play_card(0); app.play_card(0)
	turn_before=app.game_state.turn
	app.end_turn()
	await tree.create_timer(2.2).timeout
	_check(result, not app.striking and app.game_state.turn==turn_before+1, "未跳过连打完整命中后自动结束回合")
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0); Run.debug_jump_room(app.run_state,6); app.game_state=app.run_state.game; app._render()
	app.striking=true; app.strike_hp=1.0
	app._hit_entry({"damage":2,"k":"plain","v":1,"id":-100},0)
	var kills: int=_art_count(app.fx,"fx_kill")
	app._hit_entry({"damage":2,"k":"plain","v":1,"id":-101},1)
	_check(result, kills==1 and _art_count(app.fx,"fx_kill")==1, "只有首次越过零血才播放打穿效果")
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0)
	Run.debug_set_doors(app.run_state,[{"monster":"soldier","reward":"card"},{"monster":"bear","reward":"heal"}]); Run.choose_door(app.run_state,0)
	app.game_state=app.run_state.game; Run.debug_set_wind(app.run_state,1); app.debug_deal([4]); app.play_card(0)
	_check(result, app.art.get_stay(app.monster)=="wound_down", "wind规则效果映射到松完发条持久动画")
	app._reset(); Run.debug_jump_room(app.run_state,6); app.game_state=app.run_state.game; app.debug_deal([4]); Run.debug_set_monster_hp(app.run_state,680000); app.game_state.m=1000; app._render(); app.play_card(0)
	_check(result, app.monster.action_name=="layer" and app.rule_sign.action_name=="flip", "layers规则效果映射龙换层和牌子翻面")
	app._reset(); Run.debug_jump_room(app.run_state,3); app.game_state=app.run_state.game; app._render(); app._update_countdown(2,true)
	_check(result, app.monster.action_name=="tick" and app.countdown_art.action_name=="tick", "倒计时更新同时播放座钟和圆章tick")
	app._reset(); app.start_practice(); app.prefs.formula=true; app.debug_deal([1,1]); app.play_card(0)
	_check(result, app.formula_text!=null and not app.formula_text.text.is_empty(), "展开算式使用完整数字格式")
	app.prefs.formula=false
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0); Run.debug_set_countdown(app.run_state,0); app.game_state=app.run_state.game; app._render()
	var hearts_before: int=app.run_state.hearts
	app.end_turn()
	await tree.create_timer(1.3).timeout
	_check(result, not app.attacking and app.run_state.hearts==hearts_before-1, "怪出手完成330ms心碎及1100ms恢复")
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0); Run.abandon_run(app.run_state)
	var directory: String=app.storage.directory
	var blocked: FileAccess=FileAccess.open(directory+"blocked",FileAccess.WRITE); blocked.store_string("block directory"); blocked.close()
	app.storage.directory=directory+"blocked/"
	var played_before: int=app.records.played
	app._persist()
	_check(result, app.pending_settlements.size()==1, "纪录写入失败保留当前结算")
	app.start_practice()
	_check(result, app.pending_settlements.size()==1, "切换练习仍保留失败结算")
	app.storage.directory=directory; app._flush_settlements()
	_check(result, app.pending_settlements.is_empty() and app.records.played==played_before+1, "存储恢复后重试结算且只记一次")
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0); Run.debug_set_monster_hp(app.run_state,0); Run.end_run_turn(app.run_state)
	app.game_state=app.run_state.game; app.last_loot_fight=app.run_state.fight; app._render()
	var picked: Control=app.loot_cards[0]; var faded: Control=app.loot_cards[1]
	var loot_origin: Vector2=picked.position; var deck_before: int=app.run_state.cards.size()
	app._take_loot(0)
	await tree.create_timer(0.24).timeout
	_check(result, picked.position!=loot_origin and picked.scale.y<float(app.layout.loot.scale)*1.15 and picked.modulate.a<1.0, "选中战利品在500ms内飞向牌库并缩小")
	_check(result, faded.modulate.a<0.5, "未选战利品在300ms内淡出")
	await tree.create_timer(0.36).timeout
	_check(result, not app.transition and app.run_state.cards.size()==deck_before+1, "战利品动画完成后进入规则指定下一阶段")
	app.go_home(); app.forced_layout="landscape"; app._resize()
	var home: BoxContainer=app.scene.find_child("HomeRecords",true,false)
	_check(result, home is HBoxContainer and home.get_child_count()==2 and home.get_theme_constant("separation")==24, "横屏首页纪录以两段横排并间隔24")
	app.forced_layout="portrait"; app._resize(); home=app.scene.find_child("HomeRecords",true,false)
	_check(result, home is VBoxContainer and home.get_child_count()==2 and home.get_theme_constant("separation")==8, "竖屏首页纪录以两段纵排并间隔8")
	var window_size: Vector2i=app.get_window().size
	app.get_window().size=Vector2i(720,1600); app.forced_layout="portrait"; app._resize()
	_check(result, app.layout.height>app.L.base("portrait").height and app.layout.growth.centers[0].y>app.L.base("portrait").growth.centers[0].y, "长竖屏运行时实际调用fit分配额外高度")
	app.get_window().size=Vector2i(1920,720); app.forced_layout="landscape"; app._resize()
	_check(result, app.layout.width==app.L.base("landscape").width+640 and app.get_window().content_scale_aspect==Window.CONTENT_SCALE_ASPECT_EXPAND, "超宽横屏运行时fit额外宽度遵守640上限")
	app.get_window().size=window_size; app.forced_layout="portrait"; app._resize()
	for kind: String in ["relic","loot","door","shop"]:
		var item: Control=Control.new(); item.size=Vector2(200,300); item.position=Vector2(100,100); item.scale=Vector2.ONE*0.8; app.scene.add_child(item)
		var center_before: Vector2=item.get_transform()*(item.size/2.0)
		app._selectable(item,true,Callable(),{},kind)
		var factor: float=1.08 if kind=="relic" else 1.15 if kind=="loot" else 1.0
		var shift: float=40.0 if kind in ["relic","loot"] else 18.0 if kind=="door" else 14.0
		_check(result, item.scale.is_equal_approx(Vector2.ONE*0.8*factor) and (item.get_transform()*(item.size/2.0)).is_equal_approx(center_before+Vector2(0,-shift)), "各类选择只应用原位移和缩放："+kind)
	app._toast("提示测试")
	_check(result, app.active_toast.has_method("set_border_width") and is_equal_approx(app.active_toast.position.x+app.active_toast.size.x/2.0,float(app.layout.toast.x)) and is_equal_approx(app.active_toast.position.y+app.active_toast.size.y,float(app.layout.banner.y)), "提示使用九宫格并以toast中心和横幅上沿定位")
	await tree.create_timer(1.3).timeout
	_check(result, app.active_toast==null, "提示在H5原1200毫秒后移除")
	await _new_parity_cases(app,tree,result)
	if app.has_method("shutdown_presentation"):
		await app.shutdown_presentation()
		_check(result, app.animations.is_empty() and app.get("_timers").is_empty() and not app.striking, "截图退出可取消计时器和活跃连打")
	else: _check(result,false,"截图退出可取消计时器和活跃连打")
	app.queue_free()
	await tree.process_frame
	return result

static func _check(result: Dictionary, condition: bool, title: String) -> void:
	result["names"].append(title)
	if condition:
		result["passed"] += 1
	else:
		result["failed"].append(title)

static func _card_count(node: Node) -> int:
	var count: int = 1 if node.get_script() == Card else 0
	for child: Node in node.get_children():
		count += _card_count(child)
	return count

static func _art_count(node: Node, id: String) -> int:
	if node.is_queued_for_deletion(): return 0
	var count: int=1 if node.has_method("play_event") and node.get("art_id")==id else 0
	for child: Node in node.get_children(): count+=_art_count(child,id)
	return count

static func _label_contains(node: Node, text: String) -> bool:
	if node is Label and node.text.contains(text): return true
	for child: Node in node.get_children():
		if _label_contains(child,text): return true
	return false

static func _new_parity_cases(app: Control, tree: SceneTree, result: Dictionary) -> void:
	app._reset(); app.start_adventure(); Run.choose_relic(app.run_state,0)
	Run.debug_set_doors(app.run_state,[{"monster":"bear","reward":"card"},{"monster":"chest","reward":"heal"}]); Run.choose_door(app.run_state,0)
	Run.debug_give_relic(app.run_state,"start2")
	app.game_state=app.run_state.game; app.debug_deal([1]); app.play_card(0)
	var effects: GridContainer=app.scene.find_child("RowEffects"+str(app.game_state.row[0].id),true,false)
	await tree.process_frame
	_check(result,effects!=null and effects.columns==2 and effects.get_child_count()>=2 and is_equal_approx(effects.get_child(0).position.y,effects.get_child(1).position.y),"两枚桌牌效果标签按源同一行两列排布")
	app._reset(); Run.debug_set_monster_hp(app.run_state,0); Run.end_run_turn(app.run_state); app.game_state=app.run_state.game; app.run_state.monster.overkill=10; app.selected_loot=-1; app._render()
	_check(result,_label_contains(app.scene,"超杀 "+app.R.format_overkill(10)+"！多一张可选"),"超杀十倍战利品保留多一张可选提示")
	Run.debug_enter_shop(app.run_state); app.game_state=app.run_state.game; app.shop_mode=""; app._render()
	var skip: Button=_find_button(app.scene,"不用了")
	if skip!=null: skip.pressed.emit()
	_check(result,app.modal!=null and _has_button_text(app.modal,"再看看") and not _has_button_text(app.modal,"算了"),"工坊不操作确认使用原再看看取消文案")
	app._close_modal()
	app._reset(); app.start_practice(); app.debug_enabled=true
	for type: String in ["bag","lens"]:
		app._reset(); app.debug_deal([type,1,4]); app.play_card(0)
		var identity: int=app.game_state.row[0].id
		var view: Control=app.row_nodes[identity]
		var instance: int=view.get_instance_id()
		await tree.create_timer(0.05).timeout
		app.play_card(0)
		var current: Control=app.row_nodes[identity]
		_check(result,current.get_instance_id()==instance and current.get("_artwork").action_name=="play","快速续牌保留上一张工具动画："+type)
	app._reset(); app.debug_deal([1,2,4])
	var next_id: int=app.game_state.hand[1].id
	var next_instance: int=app.hand_nodes[next_id].get_instance_id()
	app.play_card(0)
	var reused: Control=app.hand_nodes[next_id]
	var point: Vector2=reused.get_meta("layout_origin")+Vector2(40,100)
	var down: InputEventScreenTouch=InputEventScreenTouch.new(); down.index=7; down.pressed=true; down.position=app.stage.get_global_transform()*point
	reused.gui_input.emit(down)
	var move: InputEventScreenDrag=InputEventScreenDrag.new(); move.index=7; move.position=app.stage.get_global_transform()*Vector2(300,300)
	app._input(move)
	var up: InputEventScreenTouch=InputEventScreenTouch.new(); up.index=7; up.pressed=false; up.position=move.position
	app._input(up)
	_check(result,reused.get_instance_id()==next_instance and app.game_state.row[-1].id==next_id,"手牌复用后真实触屏输入按id重新寻找移动后的索引")
	app._reset(); app.debug_deal(["lens",1]); app.play_card(0)
	var lens_id: int=app.game_state.row[0].id
	var lens_instance: int=app.row_nodes[lens_id].get_instance_id()
	app.game_state.xp[0]=14; app.play_card(0)
	_check(result,app.row_nodes[lens_id].get_instance_id()!=lens_instance,"成长跨形态后按faceKey重建旧牌面")
	app._reset(); app.debug_deal([1])
	var id: int=app.game_state.hand[0].id
	app.drag_prediction=app.C.preview_card(app.game_state,app.game_state.hand[0]); app._rows()
	_check(result,app.row_nodes.is_empty(),"拖牌预览不进入真实Row缓存")
	var prior: Control=app.get("row_preview")
	if prior==null: prior=app.row_nodes.get(id)
	var prior_instance: int=prior.get_instance_id() if prior!=null else -1
	app.drag_prediction={}; app.play_card(0)
	_check(result,app.row_nodes[id].get_instance_id()!=prior_instance,"正式出牌不会复用拖牌预览")
	app._reset(); app.debug_deal([1,"mirror",4]); app.play_card(0); app.play_card(0)
	var mirror_id: int=app.game_state.row[1].id
	_check(result,app.row_nodes[mirror_id].get_node_or_null("TemporaryMirror")!=null,"镜子先显示200ms未知牌面")
	app.play_card(0)
	_check(result,app.row_nodes[mirror_id].get_node_or_null("TemporaryMirror")!=null,"镜子切真脸计时器跨普通render保留")
	await tree.create_timer(0.24).timeout
	_check(result,app.row_nodes[mirror_id].get_node_or_null("TemporaryMirror")==null,"镜子200ms后切换真实牌面")
	app._reset(); app.debug_deal([1,1,1,1,1,1,1,1,1,1,1,1])
	for index: int in range(12): app.play_card(0)
	var damage_labels: int=0
	for node: Control in app.row_labels:
		if node.get_meta("row_damage",false): damage_labels+=1
	_check(result,damage_labels==app.game_state.row.size(),"密集桌牌仍逐张显示全部伤害")
	app.prefs.formula=true; app._render()
	_check(result,_has_button_text(app.scene,"收起算式 ▴"),"算式展开使用H5收起文案")
	app.prefs.formula=false
	app._inspect_card({"id":999,"v":1})
	_check(result,app.modal.get_meta("title","")==app.C.CARD_NAMES[1] and not _label_contains(app.modal,"宝石底数"),"普通牌查看使用原牌名且不新增说明")
	app._close_modal()
	app._show_rules()
	var copy: Dictionary=JSON.parse_string(FileAccess.get_file_as_string("res://data/ui-copy.json"))
	var same: bool=true
	for text: String in copy.rules: same=same and _label_contains(app.modal,text)
	for section: Array in copy.sections:
		for text: String in section: same=same and _label_contains(app.modal,text)
	_check(result,same,"规则说明逐条保留H5提取原文")
	app._close_modal()
	app.start_adventure(); Run.choose_relic(app.run_state,0)
	Run.debug_set_doors(app.run_state,[{"monster":"chest","reward":"card"},{"monster":"bear","reward":"heal"}]); Run.choose_door(app.run_state,0)
	app.game_state=app.run_state.game; Run.debug_give_relic(app.run_state,"twice"); app.debug_deal(["bag",2]); Run.debug_set_countdown(app.run_state,2); app._render()
	var green: Dictionary=app.game_state.hand[1]
	var warning: Node=app.scene.find_child("HandWarning"+str(green.id),true,false)
	_check(result,warning!=null and warning.text=="会挨打","出手警告使用H5会挨打文案")
	_check(result,app.hand_nodes[app.game_state.hand[0].id].find_child("TwiceBadge",true,false)!=null,"可重复工具显示规则提供的乘二角标")
	app._preview_card(green,600)
	_check(result,_label_contains(app.preview,"咬手：出手提前 1 回合"),"大图预览保留怪规矩影响原文")
	app._hide_preview()
	app.play_card(0)
	_check(result,app.hand_nodes.size()<app.game_state.hand.size(),"口袋新摸手牌在300ms前不进入可见手牌")
	await tree.create_timer(0.32).timeout
	await tree.process_frame
	var chosen: Variant=app.R.best_hint_card(app.run_state)
	var hint: Node=app.scene.find_child("HandHint"+str(chosen),true,false)
	var expected: String=""
	for card: Dictionary in app.game_state.hand:
		if card.id==chosen: expected=app.C.format_card_hint(app.R.preview_run_card(app.run_state,card))
	_check(result,hint!=null and hint.text==expected,"手牌提示使用formatCardHint原返回值")
	_check(result,app.hand_nodes.size()==app.game_state.hand.size(),"口袋300ms后才显示全部新摸手牌")
	var starts: Array[float]=[]
	for animation: Dictionary in app.animations:
		if animation.duration==380.0 and animation.get("persistent",false): starts.append(float(animation.start))
	starts.sort()
	_check(result,starts.size()>=2 and is_equal_approx(starts[1]-starts[0],140.0),"口袋哨子新摸牌使用140ms绘制间隔")
	app._reset(); app.start_practice()
	var first: Control=app.hand_nodes[app.game_state.hand[0].id]
	_check(result,is_equal_approx(first.scale.x,float(app.layout.deck.w)*0.9/200.0) and is_equal_approx(first.rotation_degrees,-8.0),"普通摸牌从牌库90%宽度和负8度开始")
	if app.has_method("_draw_frame") and app.has_method("_ease_cubic"):
		var frame: Dictionary=app._draw_frame(0.55,Vector2(-500,-300),0.4,9.0)
		_check(result,frame.translation==Vector2(-225,-275) and is_equal_approx(frame.rotation,5.0) and is_equal_approx(frame.scale,0.76),"摸牌55%关键点使用原平移旋转缩放")
		_check(result,absf(app._ease_cubic(0.35,0.25,0.7,0.35,1.0)-0.7625)<0.00000001,"摸牌贝塞尔按原曲线求值")
	else:
		_check(result,false,"摸牌55%关键点使用原平移旋转缩放")
		_check(result,false,"摸牌贝塞尔按原曲线求值")

static func _has_button_text(node: Node,text: String) -> bool:
	if node is Button and node.text==text: return true
	for child: Node in node.get_children():
		if _has_button_text(child,text): return true
	return false

static func _find_button(node: Node,text: String) -> Button:
	if node is Button and node.text==text: return node
	for child: Node in node.get_children():
		var found: Button=_find_button(child,text)
		if found!=null: return found
	return null
