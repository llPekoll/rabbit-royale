extends HubCard
## LA CARTE DE QUETE — une demande a la fois, en tete de la colonne
## (quest-card.tsx).
##
## CE QU'ELLE MONTRE : la quete a l'affiche (config/quests.ts), sa place dans
## l'arc, la demande en une ligne, et ou en est le joueur face au but. Quand
## la quete est FAITE, la carte pousse une dalle CLAIM en travers de son pied
## — la meme forme que HARVEST, parce que c'est le meme geste : quelque chose
## est la, prends-le. La phrase de l'ile n'est PAS sur la carte ; elle se
## dit une fois, en pastille, quand la recompense est prise. Une carte est
## une instruction, et une instruction avec un paragraphe dessous est une
## carte que personne ne lit sur un telephone.
##
## LA DEMANDE, PAS LE TITRE : a cette taille il y a la place pour une ligne,
## et « Dig 10 tiles. » est celle qui dit quoi faire. Faite, la carte montre
## le titre (en vert sombre) : la dalle dit deja « fini », et l'or etait
## illisible sur le parchemin.
##
## RIEN ICI NE BLOQUE. Un joueur qui ignore la carte joue le meme jeu ; la
## carte est une traction, et la recompense est ce qui tire. Quand tout est
## pris, la carte n'est pas rendue — la colonne pose la ligne « et
## maintenant » a sa place (next_strip.gd).
##
## DEUX MOMENTS, detectes sur le tableau et non annonces par le serveur :
## FAITE, la premiere fois que la carte lit `done` pour une quete — un anneau
## d'or s'allume autour ; PRISE, quand `Home.quest_claimed` part — une
## rafale de butin et la demande suivante glisse en place.

## La lampe : l'anneau d'or qui s'allume autour d'une quete faite.
const LIT := Color("#ffd138")
## Le titre d'une quete faite, lisible sur le parchemin.
const DONE_INK := Color("#2f5d1e")
## Combien de pieces une prise jette. Une petite victoire a une petite scene.
const CONFETTI_COUNT := 18
## Une piece sur trois est un joyau (ici la carotte), les autres des pieces
## d'or : que des joyaux fait une vitrine, aucun fait une caisse.
const JEWEL_EVERY := 3
const GLOW_SECONDS := 1.1
const NEXT_SECONDS := 0.36
const NEXT_SLIDE := 24.0

var _quest_id := ""
var _last_done := ""
var _slab: HubSlab
var _glow: Panel
var _burst: Control


func _ready() -> void:
	art = Kit.SCROLL
	_burst = Control.new()
	_burst.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_burst)
	Home.changed.connect(refresh)
	Home.quest_claimed.connect(_on_claimed)
	I18N.locale_changed.connect(func(_code: String) -> void: refresh())
	refresh()


## RELIRE la quete et se reecrire. Cache sans quete a l'affiche.
func refresh() -> void:
	var quest := Home.active_quest()
	visible = not quest.is_empty()
	if quest.is_empty():
		_quest_id = ""
		return
	var done := bool(quest.get("done", false))
	_quest_id = String(quest.get("id", ""))

	# La part du jardin quand il y a une dalle a tenir, celle de l'energie
	# sinon : une carte a taille de dalle sans dalle est un trou.
	share = 14.5 if done else 12.4
	floor_px = 66.0 if done else 44.0
	art_share = 39.0 if done else 59.0
	art_top = done
	layout()
	clear()

	add_row(I18N.f("quest.counter", [int(quest.get("index", 1)), int(quest.get("total", 1))]))
	# LA DEMANDE SE LIT TOUJOURS, en encre de valeur et non en lavis : c'est
	# la seule ligne qui dit quoi faire, pas un taux qu'on peut sauter. Le
	# compte la suit sur SA ligne : a cote de l'en-tete, « 4/10 » coupait
	# « QUEST 1 / 10 » en « QUEST 1 / 1 ».
	var ask := String(quest.get("ask", ""))
	if int(quest.get("goal", 0)) > 1:
		ask += "  " + I18N.f("quest.progress", [int(quest.get("progress", 0)), int(quest.get("goal", 0))])
	# Faite, le titre en vert sombre : l'or de la lampe se perdait sur le
	# parchemin (2026-09-24), et la dalle CLAIM dit deja « fini ».
	add_sub(String(quest.get("title", "")) if done else ask, DONE_INK if done else VALUE, true)

	_slab = null
	if done:
		_slab = HubSlab.new("carrot", slab_height())
		_slab.set_lit(not Home.pending)
		_reward_words(_slab, quest)
		_slab.pressed.connect(_claim)
		set_footer(_slab)

	# FAITE, une fois par quete : l'anneau s'allume.
	if done and _last_done != _quest_id:
		_last_done = _quest_id
		_celebrate()


## LA RECOMPENSE, comme la dalle la nomme : ce qu'on recoit, pas son nom
## (`rewardLabel`). Le nom d'un objet vient du dictionnaire, pas de sa cle
## avec un S anglais colle dessus.
func _reward_words(slab: HubSlab, quest: Dictionary) -> void:
	var reward: Dictionary = quest.get("reward", {}) if quest.get("reward") is Dictionary else {}
	var size := slab_text()
	var item: Variant = reward.get("item", null)
	if item is Dictionary:
		slab.add_word(I18N.f("quest.claimItem", [int(item.get("qty", 1)), I18N.t("items.%s.name" % String(item.get("kind", "")))]), size)
		return
	var carrots := int(reward.get("carrots", 0))
	if carrots > 0:
		# Le web ecrit l'emoji carotte dans la chaine ; la face pixel n'en a
		# pas, alors la marque du jeu prend sa place a cote du chiffre.
		var words := I18N.f("quest.claimCarrots", [carrots]).replace("🥕", "").strip_edges()
		slab.add_price(I18N.shout(words), size, Kit.icon(Kit.ICONS["carrot"], float(card_size(12, 7, 12))))
		return
	slab.add_word(I18N.t("quest.claim"), size)


func _claim() -> void:
	if _quest_id.is_empty() or Home.pending:
		return
	Home.claim_quest(_quest_id)


## L'anneau d'or de `.rr-quest-done` : 4 px de bord et 28 de halo a 20 %,
## eteints a 100 %, avec un souffle de 3 % sur la carte.
func _celebrate() -> void:
	# Une quete finie carillonne (page.tsx, l'effet sur la quete active).
	Sound.play("chime")
	if _glow != null:
		_glow.queue_free()
	_glow = Panel.new()
	_glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var s := StyleBoxFlat.new()
	s.bg_color = Color.TRANSPARENT
	s.set_border_width_all(4)
	s.border_color = Color(LIT, 0.9)
	s.set_corner_radius_all(12)
	s.shadow_color = Color(LIT, 0.7)
	s.shadow_size = 14
	_glow.add_theme_stylebox_override("panel", s)
	add_child(_glow)
	Kit.fill(_glow)
	_glow.modulate.a = 0.0
	pivot_offset = size * 0.5
	var tween := create_tween().set_parallel(true)
	tween.tween_property(_glow, "modulate:a", 1.0, GLOW_SECONDS * 0.2)
	tween.tween_property(_glow, "modulate:a", 0.0, GLOW_SECONDS * 0.8).set_delay(GLOW_SECONDS * 0.2).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "scale", Vector2(1.03, 1.03), GLOW_SECONDS * 0.2)
	tween.tween_property(self, "scale", Vector2.ONE, GLOW_SECONDS * 0.8).set_delay(GLOW_SECONDS * 0.2).set_ease(Tween.EASE_OUT)
	tween.chain().tween_callback(_glow.queue_free)


## PRISE : la rafale depuis le centre, et la demande suivante glisse de la
## droite (`.rr-quest-next`, 24 px en 360 ms).
func _on_claimed(_id: String, _reward: Dictionary) -> void:
	_confetti()
	if not visible:
		return
	var tween := create_tween().set_parallel(true)
	modulate.a = 0.0
	var home := position
	position.x = home.x + NEXT_SLIDE
	tween.tween_property(self, "modulate:a", 1.0, NEXT_SECONDS).set_ease(Tween.EASE_OUT)
	tween.tween_property(self, "position:x", home.x, NEXT_SECONDS).set_ease(Tween.EASE_OUT)


## Une rafale de butin depuis le centre de la carte (ConfettiBurst) : les
## pieces partent vers le haut, en eventail, et retombent en s'eteignant.
## Le web jette les pieces et joyaux du kit d'arcade, qui ne sont pas dans
## les assets du client : des pieces d'or et des carottes, au pixel entier.
func _confetti() -> void:
	var centre := size * 0.5
	for i in CONFETTI_COUNT:
		var scale_px := 1 if randf() < 0.5 else 2
		var piece: Control
		if i % JEWEL_EVERY == 0:
			piece = Kit.icon(Kit.ICONS["carrot"], 8.0 * scale_px)
		else:
			var coin := ColorRect.new()
			coin.color = Palette.GOLD
			coin.custom_minimum_size = Vector2(6.0 * scale_px, 6.0 * scale_px)
			coin.size = coin.custom_minimum_size
			coin.mouse_filter = Control.MOUSE_FILTER_IGNORE
			piece = coin
		piece.position = centre
		piece.pivot_offset = piece.custom_minimum_size * 0.5
		_burst.add_child(piece)
		var angle := randf_range(-PI, 0.0)
		var speed := randf_range(70.0, 150.0)
		var seconds := randf_range(0.7, 1.0)
		var tween := create_tween().set_parallel(true).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
		tween.tween_property(piece, "position", centre + Vector2(cos(angle) * speed, sin(angle) * speed + 90.0), seconds)
		tween.tween_property(piece, "rotation", deg_to_rad(randf_range(-360.0, 360.0)), seconds)
		tween.tween_property(piece, "modulate:a", 0.0, seconds)
		tween.chain().tween_callback(piece.queue_free)
