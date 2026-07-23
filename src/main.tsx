import { createRoot } from "react-dom/client";
import { GifEditor } from "./App";

const root = document.getElementById("tool-root");

if (root) {
  createRoot(root).render(<GifEditor />);
}
