/**
 * Component to highlight customizable fields in XML preview
 */

import React from "react";
import type { HighlightedField, CustomizationField } from "./types";

interface FieldHighlighterProps {
  content: string;
  fields: CustomizationField[];
  onFieldClick?: (field: CustomizationField) => void;
}

/**
 * Highlight fields in content and return JSX with highlights
 */
export function highlightFieldsInContent(
  content: string,
  fields: CustomizationField[],
  onFieldClick?: (field: CustomizationField) => void
): React.ReactNode[] {
  if (fields.length === 0) {
    return [<span key="no-fields">{content}</span>];
  }

  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  
  // Create a map of line numbers to fields
  const fieldsByLine = new Map<number, CustomizationField[]>();
  for (const field of fields) {
    if (field.lineNumber) {
      if (!fieldsByLine.has(field.lineNumber)) {
        fieldsByLine.set(field.lineNumber, []);
      }
      fieldsByLine.get(field.lineNumber)!.push(field);
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    const line = lines[i];
    const lineFields = fieldsByLine.get(lineNumber) || [];

    if (lineFields.length === 0) {
      elements.push(
        <span key={`line-${i}`}>
          {line}
          {i < lines.length - 1 && '\n'}
        </span>
      );
    } else {
      // Highlight fields in this line
      let lastIndex = 0;
      const lineElements: React.ReactNode[] = [];
      
      // Sort fields by position in line
      const sortedFields = lineFields
        .map(field => ({
          field,
          index: line.indexOf(field.currentValue),
        }))
        .filter(f => f.index >= 0)
        .sort((a, b) => a.index - b.index);

      for (const { field, index } of sortedFields) {
        // Add text before field
        if (index > lastIndex) {
          lineElements.push(
            <span key={`line-${i}-before-${index}`}>
              {line.substring(lastIndex, index)}
            </span>
          );
        }

        // Add highlighted field
        lineElements.push(
          <span
            key={`line-${i}-field-${field.id}`}
            className="bg-green-500/30 text-green-300 px-1 rounded cursor-pointer border border-green-500/50 hover:bg-green-500/50 transition-colors"
            onClick={() => onFieldClick?.(field)}
            title={`${field.field}: ${field.currentValue} → ${field.suggestedValue}`}
          >
            {field.currentValue}
          </span>
        );

        lastIndex = index + field.currentValue.length;
      }

      // Add remaining text
      if (lastIndex < line.length) {
        lineElements.push(
          <span key={`line-${i}-after`}>
            {line.substring(lastIndex)}
          </span>
        );
      }

      elements.push(
        <span key={`line-${i}`}>
          {lineElements}
          {i < lines.length - 1 && '\n'}
        </span>
      );
    }
  }

  return elements;
}

/**
 * Get highlight positions for a specific field
 */
export function getFieldHighlightPositions(
  content: string,
  field: CustomizationField
): Array<{ line: number; start: number; end: number }> {
  const positions: Array<{ line: number; start: number; end: number }> = [];
  const lines = content.split('\n');
  const searchValue = field.currentValue;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let searchIndex = 0;
    
    while (true) {
      const index = line.indexOf(searchValue, searchIndex);
      if (index === -1) break;
      
      positions.push({
        line: i + 1,
        start: index,
        end: index + searchValue.length,
      });
      
      searchIndex = index + 1;
    }
  }

  return positions;
}
