import "./style.css";
import { Game } from "./game/Game";

const canvas = document.querySelector<HTMLCanvasElement>("#game-canvas");
const root = document.querySelector<HTMLElement>("#ui-root");
if (!canvas || !root) throw new Error("Missing game roots");

const game = new Game(canvas, root);
game.start();
