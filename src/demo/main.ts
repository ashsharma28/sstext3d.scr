import ScreenSaver3DText, { Animation } from "..";

document.getElementById("form")?.addEventListener("submit", (event) => {
	event.preventDefault();

	const formData = new FormData(event.target as HTMLFormElement);
	const data = Object.fromEntries(formData);
	const ss3d = new ScreenSaver3DText({
		text: data.text as string,
		animation: data.animation as Animation,
		rotationSpeed: 1.1 - parseFloat(data.speed as string),
	});

	// split the provided string into letters and add each letter as its own actor
	const input = (data.text as string) || "";
	const actorOptions = {
		animation: data.animation as Animation,
		rotationSpeed: 1.1 - parseFloat(data.speed as string),
	};

	for (const ch of Array.from(input)) {
		// only animate alphabet characters (A-Z, a-z)
		if (/[A-Za-z]/.test(ch)) {
			ss3d.addText(ch, actorOptions as any);
		}
	}
	ss3d.start();
});
