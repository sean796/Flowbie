import { useCallback, useRef } from "react";
import { toast } from "sonner";
import { insertContentIntoSection } from "@/lib/section-parser";

interface UseImageInsertionProps {
  finalOutput: string;
  setGenerationResult?: (result: any) => void;
}

export function useImageInsertion({ finalOutput, setGenerationResult }: UseImageInsertionProps) {
  const finalOutputRef = useRef<string>(finalOutput);
  
  // Keep ref in sync with prop
  finalOutputRef.current = finalOutput;

  const handleInsertImageIntoSection = useCallback((sectionHeader: string, imageMarkdown: string) => {
    // Use ref to get the most recent finalOutput value
    const currentFinalOutput = finalOutputRef.current;
    
    if (!currentFinalOutput || !setGenerationResult) {
      toast.error("Cannot insert image: final output not available.");
      return;
    }
    
    try {
      console.log('Inserting image into section:', sectionHeader);
      console.log('Image markdown:', imageMarkdown.substring(0, 100));
      console.log('Current finalOutput length:', currentFinalOutput.length);
      
      const updatedOutput = insertContentIntoSection(currentFinalOutput, sectionHeader, imageMarkdown, 'end');
      
      console.log('Updated output length:', updatedOutput.length);
      console.log('Output changed:', updatedOutput !== currentFinalOutput);
      
      if (updatedOutput === currentFinalOutput) {
        console.warn('No change detected - section may not have been found');
        toast.error(`Section "${sectionHeader}" not found. Please check the section name.`);
        return;
      }
      
      setGenerationResult((prev: any) => ({
        ...prev,
        final: updatedOutput
      }));
      
      toast.success(`Image inserted into "${sectionHeader}" section!`);
    } catch (error) {
      console.error("Error inserting image:", error);
      toast.error("Failed to insert image into section.");
    }
  }, [setGenerationResult]);

  return { handleInsertImageIntoSection };
}

