import { splitFrontmatter } from '../shared/frontmatter'

export function excerptOf(markdown: string, maxLength = 200): string {
  const text = splitFrontmatter(markdown)
    .body.replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/~~~[\s\S]*?(~~~|$)/g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[\[([^\]|]*\|)?([^\]]*)\]\]/g, '$2')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[\^[^\]]+\]:?/g, '')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '$1')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ')
    .replace(/^[\s|:-]{3,}$/gm, ' ')
    .replace(/^\s{0,3}#{1,6}(?=\S|\s|$)\s*/gm, '')
    .replace(/^\s{0,3}(>\s*)+(\[![A-Za-z]+\]-?\s*)?/gm, '')
    .replace(/^\s{0,3}([-*+]|\d+[.)])\s+(\[[ xX]\]\s+)?/gm, '')
    .replace(/\\([\\`*_{}[\]()#+.!|~>-])/g, '$1')
    .replace(/(\*\*|__|~~|==)(?=\S)(.+?)(?<=\S)\1/g, '$2')
    .replace(/(?<![\w*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\w*])/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}
