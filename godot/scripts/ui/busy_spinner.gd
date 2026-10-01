class_name BusySpinner
extends Control
## LA MOULINETTE — « le serveur est en train de repondre ».
##
## Une carotte qui se remplit (CarrotLoader), pas une roue : l'attente dit
## « ca pousse ». Branchee sur `Net.busy_changed` : elle suit les ECRITURES en vol — poser,
## acheter, enregistrer l'amenagement, un pas de raid —, jamais les relectures
## de fond.
##
## ELLE ATTEND AVANT DE SE MONTRER (DELAY) : la plupart des reponses arrivent
## en 100 ms, et une moulinette qui clignote a chaque geste se lit comme un
## ecran qui saccade. Elle ne dit quelque chose que quand l'attente se sent.

const SIZE := 40.0
const DELAY := 0.2

var _carrot: CarrotLoader
var _waiting := 0.0
var _busy := false
## EN BAS A DROITE, petite, par-dessus tout et hors de toute boite : elle ne
## pousse rien et ne se met sous rien (« pas n'importe ou qui casse le
## layout », 2026-09-23).
const MARGIN := 10.0


func _ready() -> void:
	custom_minimum_size = Vector2(SIZE, SIZE)
	size = Vector2(SIZE, SIZE)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	top_level = true
	z_index = 100
	visible = false
	_carrot = CarrotLoader.new()
	_carrot.side = SIZE
	add_child(_carrot)
	Net.busy_changed.connect(_on_busy)
	_on_busy(Net.busy())


func _on_busy(busy: bool) -> void:
	_busy = busy
	if not busy and not _seat_wait():
		_waiting = 0.0
		visible = false


## L'ILE SANS MON LAPIN : DIG a demande une place et le serveur ne l'a pas
## encore donnee — une socket qui se reconnecte, un serveur qui redemarre.
## Sans la carotte, on regardait une ile vide, l'energie a 0, sans rien qui
## dise d'attendre (2026-10-01). Un refus ou une place tenue ailleurs ne
## s'attendent pas : l'ecran dit deja autre chose.
func _seat_wait() -> bool:
	if not GameSocket.wants_seat():
		return false
	if not Screens.in_world() or Screens.place != Screens.Place.ISLAND:
		return false
	var run := RunState.current
	return run.me().is_empty() and run.spectating.is_empty() \
		and run.refusal.is_empty() and run.held_seat.is_empty()


func _process(delta: float) -> void:
	if not _busy and not _seat_wait():
		if visible:
			_waiting = 0.0
			visible = false
		return
	if not visible:
		_waiting += delta
		if _waiting < DELAY:
			return
		visible = true
		_carrot.restart()
	var view := get_viewport_rect().size
	global_position = (view - _carrot.size - Vector2(MARGIN, MARGIN)).round()
