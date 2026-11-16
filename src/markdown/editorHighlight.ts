import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";

const headingTags = [
  tags.heading1,
  tags.heading2,
  tags.heading3,
  tags.heading4,
  tags.heading5,
  tags.heading6,
];

const darkStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#d7e0f5", fontWeight: "650" },
  { tag: tags.heading1, color: "#bfd0f4", fontWeight: "700" },
  { tag: tags.heading2, color: "#b3c5ed", fontWeight: "680" },
  { tag: headingTags.slice(2), color: "#aab9d8", fontWeight: "620" },
  { tag: tags.emphasis, color: "#ccb8ed", fontStyle: "italic" },
  { tag: tags.strong, color: "#ebc88f", fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#a9c2fa", textDecoration: "underline" },
  { tag: tags.url, color: "#81cfc0", textDecoration: "underline" },
  { tag: tags.labelName, color: "#c7a8eb" },
  { tag: tags.monospace, color: "#e8bd83" },
  { tag: tags.quote, color: "#aab2c0" },
  { tag: tags.string, color: "#91cba3" },
  { tag: [tags.escape, tags.character], color: "#ee9eae" },
  { tag: tags.contentSeparator, color: "#7d899e" },
  { tag: tags.invalid, color: "#ff9c9c" },
  { tag: tags.processingInstruction, color: "#8390a1", fontWeight: "550" },
], { themeType: "dark" });

const lightStyle = HighlightStyle.define([
  { tag: tags.heading, color: "#4e5f83", fontWeight: "650" },
  { tag: tags.heading1, color: "#405b91", fontWeight: "700" },
  { tag: tags.heading2, color: "#4b6394", fontWeight: "680" },
  { tag: headingTags.slice(2), color: "#5d6e91", fontWeight: "620" },
  { tag: tags.emphasis, color: "#76559d", fontStyle: "italic" },
  { tag: tags.strong, color: "#915713", fontWeight: "700" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.link, color: "#4269a6", textDecoration: "underline" },
  { tag: tags.url, color: "#16796f", textDecoration: "underline" },
  { tag: tags.labelName, color: "#77509c" },
  { tag: tags.monospace, color: "#97532b" },
  { tag: tags.quote, color: "#697181" },
  { tag: tags.string, color: "#34794e" },
  { tag: [tags.escape, tags.character], color: "#ad4c60" },
  { tag: tags.contentSeparator, color: "#788397" },
  { tag: tags.invalid, color: "#b42332" },
  { tag: tags.processingInstruction, color: "#8892a2", fontWeight: "550" },
], { themeType: "light" });

export const markdownEditorHighlighting = [
  syntaxHighlighting(darkStyle),
  syntaxHighlighting(lightStyle),
];
