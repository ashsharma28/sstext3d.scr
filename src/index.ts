import * as THREE from "three";
import * as TWEEN from "@tweenjs/tween.js";
import { TextGeometry } from "three/examples/jsm/geometries/TextGeometry";
import { FontLoader, Font } from "three/examples/jsm/loaders/FontLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { degreesToRadians, random } from "./utils";
import addStyles from "./styles";
import { developersText, volcanoText } from "./textFunctions";
import posx from "../assets/textures/posx.png";
import negx from "../assets/textures/negx.png";
import posy from "../assets/textures/posy.png";
import negy from "../assets/textures/negy.png";
import posz from "../assets/textures/posz.png";
import negz from "../assets/textures/negz.png";
import fontObject from "../assets/fonts/helvetiker_regular.typeface.json";

export enum Animation {
	SPIN = "spin",
	SEESAW = "seesaw",
	WOBBLE = "wobble",
	TUMBLE = "tumble",
}

interface Options {
	text: string | (() => string);
	animation: Animation;
	rotationSpeed: number;

	debug?: boolean;
}

const defaultOptions: Options = {
	text: "OpenGL",
	animation: Animation.SPIN,
	rotationSpeed: 1,
};

interface TextActor {
	id: number;
	text: string;
	group: THREE.Group;
	mesh: THREE.Mesh;
	boundingBox: THREE.Box3;
	direction: THREE.Vector3;
	changingDirection: boolean;
	options: Options;
	boxHelper?: THREE.BoxHelper;
	moving?: boolean;
}

export default class ScreenSaver3DText {
	text: string;
	moveSpeed = 1;
	direction: THREE.Vector3;
	changingDirection = false;
	camera: THREE.PerspectiveCamera;
	scene: THREE.Scene;

	// support multiple text objects (actors)
	textActors: TextActor[] = [];
	private nextActorId = 1;

	textGroup: THREE.Group;
	// legacy single bounding box kept for compatibility, but actors have their own
	boundingBox?: THREE.Box3;
	renderer: THREE.WebGLRenderer;
	options: Options;
	envMap: THREE.CubeTexture;
	font?: Font;
	textMaterial: THREE.MeshPhysicalMaterial;
	running = false;

	boxHelper?: THREE.BoxHelper;

	// internal handlers / state for keyboard & touch-based exit
	private _hintElement: HTMLDivElement | null = null;
	private _lastTap = 0;
	private _confettiCanvas: HTMLCanvasElement | null = null;
	private _confetti: any | null = null;
	private _confettiActive = false;
	private _handleKeydown = (e: KeyboardEvent) => {
		if (e.key === "Escape" || e.key === "Esc") {
			this.stop();
			return;
		}

		// Enter key: center actors and stop their free movement
		if (e.key === "Enter") {
			this.centerActors();
			return;
		}
	};
	private _handleTouchEnd = (_e: TouchEvent) => {
		const now = Date.now();
		// double-tap within 300ms triggers exit
		if (now - this._lastTap <= 300) {
			this.stop();
		} else {
			this._lastTap = now;
		}
	};

	constructor(userOptions?: Partial<Options>) {
		this.options = {
			...defaultOptions,
			...userOptions,
		};

		this.text = this.getText();

		this.direction = new THREE.Vector3();

		this.camera = new THREE.PerspectiveCamera(
			50,
			window.innerWidth / window.innerHeight,
			1,
			1500
		);

		this.camera.position.set(0, 0, 200);
		const cameraTarget = new THREE.Vector3(0, 0, 0);
		this.camera.lookAt(cameraTarget);
		this.camera.updateMatrix();
		this.camera.updateMatrixWorld();

		this.scene = new THREE.Scene();
		this.scene.background = new THREE.Color(0x000000);

		const dirLight = new THREE.DirectionalLight(0xffffff, 1);
		dirLight.position.set(0, 40, 70).normalize();
		this.scene.add(dirLight);

		const textureLoader = new THREE.CubeTextureLoader();
		this.envMap = textureLoader.load([posx, negx, posy, negy, posz, negz]);
		this.envMap.encoding = THREE.sRGBEncoding;

		this.textMaterial = new THREE.MeshPhysicalMaterial({
			envMap: this.envMap,
			metalness: 0.7,
			roughness: 0,
			color: new THREE.Color(0xffffff),
		});

		// this.scene.background = textureCube;

		this.textGroup = new THREE.Group();
		this.textGroup.position.set(0, 0, 0);
		this.scene.add(this.textGroup);

		const loader = new FontLoader();
		this.font = loader.parse(fontObject);
		// no default actor created here — actors will be added explicitly (e.g. from demo)

		this.boxHelper = new THREE.BoxHelper(this.textGroup, 0xffffff);
		if (this.options.debug) {
			this.scene.add(this.boxHelper);
		}

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(window.innerWidth, window.innerHeight);

		if (this.options.debug) {
			const controls = new OrbitControls(this.camera, this.renderer.domElement);
			controls.target.set(0, 0, 0);
			controls.update();
		}

		window.addEventListener("resize", () => {
			this.camera.aspect = window.innerWidth / window.innerHeight;
			this.camera.updateProjectionMatrix();

			this.renderer.setSize(window.innerWidth, window.innerHeight);
		});

		addStyles();
	}

	/**
	 * Add a new text actor to the scene. Returns an id for the actor.
	 */
	addText(text: string | (() => string), userOptions?: Partial<Options>) {
		const options: Options = {
			...this.options,
			...(userOptions || {}),
		};

		const actor: TextActor = {
			id: this.nextActorId++,
			text: typeof text === "function" ? text() : text,
			group: new THREE.Group(),
			mesh: null as unknown as THREE.Mesh,
			boundingBox: new THREE.Box3(),
			direction: new THREE.Vector3(),
			changingDirection: false,
			options,
		};

		// create geometry & mesh
		const sizeFactor = actor.text.length / 20;
		const textGeo = new TextGeometry(actor.text, {
			font: this.font!,
			size: 20 - 10 * sizeFactor,
			height: 20 - 10 * sizeFactor,
		});

		textGeo.computeBoundingBox();
		const textWidth = textGeo.boundingBox!.max.x - textGeo.boundingBox!.min.x;
		const textHeight = textGeo.boundingBox!.max.y - textGeo.boundingBox!.min.y;
		const textDepth = textGeo.boundingBox!.max.z - textGeo.boundingBox!.min.z;
		textGeo.translate(textWidth / -2, textHeight / -2, textDepth / -2);

		actor.mesh = new THREE.Mesh(textGeo, this.textMaterial);
		actor.group.add(actor.mesh);

		actor.boundingBox.setFromObject(actor.group);
		actor.direction.copy(new THREE.Vector3(random(-1, 1), random(-1, 1), 0).normalize().multiplyScalar(this.moveSpeed));
		actor.group.position.set(0, 0, 0);
		actor.moving = true;

		// optional box helper for debug
		if (options.debug) {
			actor.boxHelper = new THREE.BoxHelper(actor.group, 0xffffff);
			this.scene.add(actor.boxHelper);
		}

		this.textActors.push(actor);
		this.scene.add(actor.group);

		// if the screensaver is already running, start the actor's animation immediately
		if (this.running) {
			switch (actor.options.animation) {
				case Animation.SPIN:
					this.spinAnimation(actor);
					break;
				case Animation.SEESAW:
					this.seesawAnimation(actor);
					break;
				case Animation.WOBBLE:
					this.wobbleAnimation(actor);
					break;
				case Animation.TUMBLE:
					this.tumbleAnimation(actor);
					break;
			}
		}

		return actor.id;
	}

	start() {
		const container = document.createElement("div");
		container.setAttribute("id", "ss3dtext-wrapper");
		// append renderer canvas first
		container.appendChild(this.renderer.domElement);

		// create an overlay canvas for confetti and ensure it sits above the WebGL canvas
		this._confettiCanvas = document.createElement("canvas");
		Object.assign(this._confettiCanvas.style, {
			position: "absolute",
			top: "0",
			left: "0",
			width: "100%",
			height: "100%",
			pointerEvents: "none",
			zIndex: "10002",
		});
		container.appendChild(this._confettiCanvas);

		// if canvas-confetti is available, create an instance bound to our overlay canvas
		const globalConfetti = (window as any).confetti;
		if (globalConfetti && this._confettiCanvas) {
			try {
				this._confetti = globalConfetti.create(this._confettiCanvas, { resize: true });
			} catch (err) {
				this._confetti = globalConfetti; // fallback
			}
		}

		// don't exit on mouse move anymore — exit only on Escape key or double-tap on touch
		// listen for Escape key
		window.addEventListener("keydown", this._handleKeydown);

		// listen for touch double-tap to exit on mobile
		window.addEventListener("touchend", this._handleTouchEnd);

		// make container fill the screen so hint can be positioned inside it
		container.style.position = "fixed";
		container.style.top = "0";
		container.style.left = "0";
		container.style.width = "100%";
		container.style.height = "100%";
		container.style.zIndex = "10000";

		// small hint for keyboard exit
		this._hintElement = document.createElement("div");
		this._hintElement.id = "ss3dtext-hint";
		Object.assign(this._hintElement.style, {
			position: "absolute",
			bottom: "12px",
			left: "50%",
			transform: "translateX(-50%)",
			background: "rgba(0,0,0,0.6)",
			color: "#fff",
			padding: "6px 10px",
			borderRadius: "4px",
			fontSize: "13px",
			fontFamily: "sans-serif",
			zIndex: "10001",
			pointerEvents: "none",
		});
		this._hintElement.textContent = "Press Esc to exit (double-tap to exit on mobile)";
		container.appendChild(this._hintElement);
		document.body.appendChild(container);
		document.body.classList.add("SS3dTextActive");

		this.running = true;

		// initialize per-actor positions/animations
		for (const actor of this.textActors) {
			actor.group.position.set(0, 0, 0);
			actor.group.rotation.set(0, 0, 0);
			actor.direction.copy(new THREE.Vector3(random(-1, 1), random(-1, 1), 0).normalize().multiplyScalar(this.moveSpeed));

			switch (actor.options.animation) {
				case Animation.SPIN:
					this.spinAnimation(actor);
					break;
				case Animation.SEESAW:
					this.seesawAnimation(actor);
					break;
				case Animation.WOBBLE:
					this.wobbleAnimation(actor);
					break;
				case Animation.TUMBLE:
					this.tumbleAnimation(actor);
					break;
			}
		}

		requestAnimationFrame(this.render.bind(this));
	}

	stop() {
		this.running = false;
		document.body.classList.remove("SS3dTextActive");

		TWEEN.removeAll();

		const container = document.getElementById("ss3dtext-wrapper");
		if (container) {
			document.body.removeChild(container);
		}

		// remove keyboard & touch handlers
		window.removeEventListener("keydown", this._handleKeydown);
		window.removeEventListener("touchend", this._handleTouchEnd);

		// remove hint element if present
		if (this._hintElement && this._hintElement.parentElement) {
			this._hintElement.parentElement.removeChild(this._hintElement);
			this._hintElement = null;
		}

		// stop any active confetti loop and remove confetti canvas
		this._confettiActive = false;
		if (this._confettiCanvas && this._confettiCanvas.parentElement) {
			this._confettiCanvas.parentElement.removeChild(this._confettiCanvas);
			this._confettiCanvas = null;
		}
		this._confetti = null;
	}


	// legacy single-mesh creator removed; use addText for multiple actors

	getText() {
		let text: string | undefined;

		if (typeof this.options.text === "string") {
			text = this.options.text;
		} else if (typeof this.options.text === "function") {
			text = this.options.text();
		}

		if (!text) {
			text = "OpenGL";
		}

		if (text.length > 20) {
			throw new Error("Text must be under 20 characters");
		}

		return text;
	}

	/** Resolve a text value for an actor's configured text (string or function) */
	resolveText(optionText: string | (() => string) | undefined) {
		let text: string | undefined;

		if (!optionText) {
			optionText = this.options.text;
		}

		if (typeof optionText === "string") {
			text = optionText;
		} else if (typeof optionText === "function") {
			text = optionText();
		}

		if (!text) {
			text = "OpenGL";
		}

		if (text.length > 20) {
			throw new Error("Text must be under 20 characters");
		}

		return text;
	}

	getScreenCoordinates(worldCoords: THREE.Vector3) {
		const widthHalf = window.innerWidth / 2;
		const heightHalf = window.innerHeight / 2;

		const result = worldCoords.clone();
		result.project(this.camera);
		result.x = result.x * widthHalf + widthHalf;
		result.y = -(result.y * heightHalf) + heightHalf;

		return result;
	}


	moveAnimation(actor: TextActor) {
		// don't move actors that have been locked/centered
		if (actor.moving === false) return;

		if (!actor.boxHelper && !actor.boundingBox) {
			return;
		}

		actor.boxHelper?.setFromObject(actor.group);
		actor.boundingBox?.setFromObject(actor.group);

		const frontPoint = new THREE.Vector3().copy(actor.boundingBox.min);
		frontPoint.z = actor.boundingBox.max.z;

		const leftTopCornerPos = this.getScreenCoordinates(frontPoint);
		const rightBottomCornerPos = this.getScreenCoordinates(actor.boundingBox.max);
		const centerPos = this.getScreenCoordinates(actor.boundingBox.getCenter(new THREE.Vector3()));

		const widthExceeded = leftTopCornerPos.x <= 0 || rightBottomCornerPos.x >= window.innerWidth;
		const heightExceeded = rightBottomCornerPos.y <= 0 || leftTopCornerPos.y >= window.innerHeight;

		const centerExceededWidth = centerPos.x <= 0 || centerPos.x >= window.innerWidth;
		const centerExceededHeight = centerPos.y <= 0 || centerPos.y >= window.innerHeight;

		if (widthExceeded || heightExceeded) {
			if (!actor.changingDirection) {
				const edgeNormal = widthExceeded ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
				actor.direction.copy(actor.direction.reflect(edgeNormal));
				actor.changingDirection = true;
			}
		} else {
			actor.changingDirection = false;
		}

		if (centerExceededWidth || centerExceededHeight) {
			const edgeNormal = centerExceededWidth ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
			actor.direction.copy(actor.direction.reflect(edgeNormal));
		}

		actor.group.position.add(actor.direction);
	}


	spinAnimation(actor: TextActor) {
		new TWEEN.Tween({ y: 0 })
			.to({ y: degreesToRadians(360) }, 7500 * actor.options.rotationSpeed)
			.onUpdate((rotation) => {
				actor.group.rotation.y = rotation.y;
			})
			.repeat(Infinity)
			.start();
	}


	seesawAnimation(actor: TextActor) {
		new TWEEN.Tween({ y: degreesToRadians(45) })
			.to({ y: degreesToRadians(-45) }, 3000 * actor.options.rotationSpeed)
			.easing(TWEEN.Easing.Sinusoidal.InOut)
			.onUpdate((rotation) => {
				actor.group.rotation.y = rotation.y;
			})
			.repeat(Infinity)
			.yoyo(true)
			.start();
	}


	wobbleAnimation(actor: TextActor) {
		const animationDuration = 2000 * actor.options.rotationSpeed;

		new TWEEN.Tween({ y: degreesToRadians(45) })
			.to({ y: degreesToRadians(-45) }, animationDuration)
			.easing((amount) => {
				return amount * (2 - amount);
			})
			.chain(
				new TWEEN.Tween({ z: degreesToRadians(30) })
					.to({ z: degreesToRadians(-30) }, animationDuration)
					.easing((amount) => {
						return amount * amount;
					})
					.onUpdate((rotation) => {
						actor.group.rotation.z = rotation.z;
					})
					.repeat(Infinity)
					.yoyo(true)
					.start()
			)
			.onUpdate((rotation) => {
				actor.group.rotation.y = rotation.y;
			})
			.repeat(Infinity)
			.yoyo(true)
			.start();
	}


	tumbleAnimation(actor: TextActor) {
		const animationDuration = 5000 * actor.options.rotationSpeed;

		new TWEEN.Tween({ y: 0 })
			.to({ y: degreesToRadians(360) }, animationDuration)
			.onStart(() => {
				new TWEEN.Tween({ x: 0 })
					.to({ x: degreesToRadians(360) }, animationDuration * 1.2)
					.onUpdate((rotation) => {
						actor.group.rotation.x = rotation.x;
					})
					.repeat(Infinity)
					.start();

				new TWEEN.Tween({ z: 0 })
					.to({ z: degreesToRadians(360) }, animationDuration * 1.5)
					.onUpdate((rotation) => {
						actor.group.rotation.z = rotation.z;
					})
					.repeat(Infinity)
					.start();
			})
			.onUpdate((rotation) => {
				actor.group.rotation.y = rotation.y;
			})
			.repeat(Infinity)
			.yoyo(true)
			.start();
	}


	animate() {
		// update movement for all actors
		for (const actor of this.textActors) {
			this.moveAnimation(actor);
			// update text if it's dynamic
			const configured = actor.options.text;
			if (typeof configured === "function") {
				const newText = this.resolveText(configured);
				if (newText !== actor.text) {
					// replace mesh
					actor.group.remove(actor.mesh);
					// recreate geometry
					const sizeFactor = newText.length / 20;
					const textGeo = new TextGeometry(newText, {
						font: this.font!,
						size: 20 - 10 * sizeFactor,
						height: 20 - 10 * sizeFactor,
					});
					textGeo.computeBoundingBox();
					const textWidth = textGeo.boundingBox!.max.x - textGeo.boundingBox!.min.x;
					const textHeight = textGeo.boundingBox!.max.y - textGeo.boundingBox!.min.y;
					const textDepth = textGeo.boundingBox!.max.z - textGeo.boundingBox!.min.z;
					textGeo.translate(textWidth / -2, textHeight / -2, textDepth / -2);
					actor.mesh = new THREE.Mesh(textGeo, this.textMaterial);
					actor.group.add(actor.mesh);
					actor.text = newText;
				}
			}
		}

		TWEEN.update();
	}

	/**
	 * Stop free movement and move all actors to horizontally-centered positions
	 * preserving their insertion order. Uses per-actor geometry widths to layout.
	 */
	centerActors(duration = 6000) {
		if (!this.textActors || this.textActors.length === 0) return;

		// compute widths from each actor's mesh geometry bounding box
		const spacing = 4; // world units between letters
		const widths: number[] = [];
		for (const actor of this.textActors) {
			const geomBox = (actor.mesh.geometry as any).boundingBox as THREE.Box3 | undefined;
			if (geomBox) {
				widths.push(geomBox.max.x - geomBox.min.x);
			} else {
				// fallback: compute actor bounding box
				actor.boundingBox.setFromObject(actor.group);
				widths.push(actor.boundingBox.max.x - actor.boundingBox.min.x);
			}
		}

		const totalWidth = widths.reduce((s, w) => s + w, 0) + spacing * (widths.length - 1);
		let cursor = -totalWidth / 2;

		// stop movement immediately and animate to target positions & neutral rotations
		for (let i = 0; i < this.textActors.length; i++) {
			const actor = this.textActors[i];
			const w = widths[i];
			const targetX = cursor + w / 2;
			cursor += w + spacing;

			// stop free movement
			actor.moving = false;
			actor.direction.set(0, 0, 0);

			// ensure bounding box updated
			actor.boundingBox.setFromObject(actor.group);

			// animate position and rotation to center line
			const start = { x: actor.group.position.x, y: actor.group.position.y, z: actor.group.position.z, rx: actor.group.rotation.x, ry: actor.group.rotation.y, rz: actor.group.rotation.z };
			const end = { x: targetX, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };

			new TWEEN.Tween(start)
				.to(end, duration)
				.easing(TWEEN.Easing.Cubic.Out)
				.onUpdate((vals: any) => {
					actor.group.position.set(vals.x, vals.y, vals.z);
					actor.group.rotation.set(vals.rx, vals.ry, vals.rz);
				})
				.start();
		}

		// start confetti celebration after centering
		this.triggerConfetti();
	}

	/**
	 * Trigger confetti using canvas-confetti (loaded into window.confetti).
	 * Also fires a few popper bursts around the screen.
	 */
	triggerConfetti() {
		const confetti = this._confetti || (window as any).confetti;
		if (!confetti) return;

		this._confettiActive = true;
		const end = Date.now() + 5 * 1000; // 10 minutes
		const colors = ["#FFBD00", "#FFCA6C"];

		const frame = () => {
			if (!this._confettiActive) return;

			confetti({
				particleCount: 2,
				angle: 60,
				spread: 55,
				origin: { x: 0 },
				colors: colors,
			});
			confetti({
				particleCount: 2,
				angle: 120,
				spread: 55,
				origin: { x: 1 },
				colors: colors,
			});

			// additional popper bursts in random positions
			for (let i = 0; i < 8; i++) {
				confetti({
					particleCount: 6,
					spread: 70,
					origin: { x: Math.random(), y: Math.random() * 0.6 },
					colors: colors.concat(["#ffffff"]),
				});
			}

			if (Date.now() < end) {
				requestAnimationFrame(frame);
			}
		};

		frame();
	}

	render() {
		this.animate();

		this.renderer.clear();
		this.renderer.render(this.scene, this.camera);

		if (this.running) {
			requestAnimationFrame(this.render.bind(this));
		}
	}
}
