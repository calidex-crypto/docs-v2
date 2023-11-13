import { readFile } from "fs/promises";
import { getFilesRecursive } from "./getFilesRecursive";
import {
	parse,
	HTMLElement as X_HTMLElement,
	Node as X_Node,
	TextNode as X_TextNode,
	CommentNode as X_CommentNode,
} from "node-html-parser";
import { PageData, PageSectionData } from "../types";
import { trimExtraSpace } from "./trimExtraSpace";

export async function extractSearchData(rootDir: string): Promise<PageData[]> {
	const nextOutputDir = `${rootDir}/.next/server/app`;
	const htmlFiles = getFilesRecursive(nextOutputDir, "html");

	const pages: PageData[] = [];

	await Promise.all(
		htmlFiles.map(async (filePath) => {
			const htmlContent = await readFile(filePath, "utf-8");
			const mainEl = parse(htmlContent, {
				comment: false,
				blockTextElements: {
					pre: false, // parse text inside <pre> elements instead of treating it as text
				},
			}).querySelector("main");

			if (!mainEl) {
				console.warn(
					`No <main> element found in ${filePath}, It won't be included in the search results.`,
				);

				return;
			}

			const pageTitle = mainEl.querySelector("h1")?.text;

			pages.push({
				href: filePath.replace(nextOutputDir, "").replace(".html", ""),
				title: pageTitle ? trimExtraSpace(pageTitle) : "",
				sections: getPageSections(mainEl),
			});
		}),
	);

	return pages;
}

function getPageSections(main: X_HTMLElement): PageSectionData[] {
	const sectionData: PageSectionData[] = [];

	const ignoreTags = new Set(["code", "nav"].map((t) => t.toUpperCase()));

	function collector(node: X_Node) {
		if (node instanceof X_CommentNode) {
			return;
		} else if (node instanceof X_HTMLElement) {
			if (ignoreTags.has(node.tagName)) {
				return;
			}

			// headings -> start new section
			if (node.tagName.startsWith("H") && node.tagName !== "H1") {
				sectionData.push({
					title: node.text,
					href: node.parentNode.querySelector("a")?.getAttribute("href") || "",
					content: "",
				});
			} else {
				for (const child of node.childNodes) {
					collector(child);
				}
			}
		} else if (node instanceof X_TextNode) {
			const lastSection = sectionData[sectionData.length - 1];
			const text = node.text;
			if (text) {
				if (lastSection) {
					lastSection.content += node.text + " ";
				} else {
					sectionData.push({
						content: node.text + " ",
						href: "",
					});
				}
			}
		}
	}

	collector(main);

	sectionData.forEach((s) => {
		s.title = s.title ? trimExtraSpace(s.title) : s.title;
		s.content = trimExtraSpace(s.content);
	});

	return sectionData.filter((s) => s.title || s.content);
}