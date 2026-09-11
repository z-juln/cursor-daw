export class TreeItem {
  id?: string;
  label: string;
  constructor(label: string) {
    this.label = label;
  }
}

export const TreeItemCollapsibleState = {
  None: 0,
  Collapsed: 1,
  Expanded: 2,
};

export class ThemeIcon {}

export const Uri = {
  file: (fsPath: string) => ({ fsPath }),
};
