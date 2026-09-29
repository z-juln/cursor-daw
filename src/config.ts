import * as path from "path";
import * as vscode from "vscode";
import { DEFAULT_KEY_MAP } from "./drums";

export function getLoop(): boolean {
  return vscode.workspace.getConfiguration("cursorDaw").get("loop", true);
}

export function getPadModeOnOpen(): boolean {
  return vscode.workspace.getConfiguration("cursorDaw").get("padModeOnOpen", false);
}

export function getKeyMap(): Record<string, string> {
  const configured = vscode.workspace
    .getConfiguration("cursorDaw")
    .get<Record<string, string>>("keyMap", DEFAULT_KEY_MAP);
  return { ...DEFAULT_KEY_MAP, ...configured };
}

export function isDrumEditor(editor: vscode.TextEditor | undefined): editor is vscode.TextEditor {
  if (!editor) return false;
  if (editor.document.languageId === "cursor-daw") return true;
  const extensions = vscode.workspace
    .getConfiguration("cursorDaw")
    .get<string[]>("fileExtensions", ["daw"])
    .map((extension) => extension.replace(/^\./, "").toLowerCase());
  return extensions.includes(path.extname(editor.document.fileName).slice(1).toLowerCase());
}
