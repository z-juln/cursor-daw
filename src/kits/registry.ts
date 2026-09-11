/** 鼓组标识。合成 kit 运行时渲染；采样 kit 读取 media/kits 下预置 wav。 */
export type KitId =
  | "default"
  | "808"
  | "acoustic"
  | "wav-classic"
  | "wav-punch";

export type KitKind = "synth" | "wav";

export interface KitDefinition {
  id: KitId;
  /** 侧边栏与设置里显示的名称 */
  label: string;
  kind: KitKind;
  /** 采样 kit 在扩展目录下的文件夹名（相对 media/kits） */
  wavFolder?: string;
}

export const KIT_DEFINITIONS: KitDefinition[] = [
  { id: "default", label: "默认（合成）", kind: "synth" },
  { id: "808", label: "808（合成）", kind: "synth" },
  { id: "acoustic", label: "原声（合成）", kind: "synth" },
  { id: "wav-classic", label: "Classic（采样）", kind: "wav", wavFolder: "wav-classic" },
  { id: "wav-punch", label: "Punch（采样）", kind: "wav", wavFolder: "wav-punch" },
];

export const DEFAULT_KIT_ID: KitId = "default";

const BY_ID = new Map(KIT_DEFINITIONS.map((kit) => [kit.id, kit]));

export function kitDefinition(id: string): KitDefinition | undefined {
  return BY_ID.get(id as KitId);
}

/** 未知 kit 回落到 default，并返回是否发生了回落。 */
export function normalizeKitId(raw: string): { kitId: KitId; fallback: boolean } {
  const trimmed = raw.trim().toLowerCase();
  if (kitDefinition(trimmed)) return { kitId: trimmed as KitId, fallback: false };
  return { kitId: DEFAULT_KIT_ID, fallback: true };
}

export function isSynthKit(id: KitId): boolean {
  return kitDefinition(id)?.kind === "synth";
}

export function wavFolderFor(id: KitId): string | undefined {
  return kitDefinition(id)?.wavFolder;
}
