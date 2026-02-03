import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usStates, canadianProvinces } from "@/lib/keyword-location-utils";

interface LocationSelectorProps {
  country: "United States" | "Canada";
  stateProvince: string;
  city: string;
  onCountryChange: (value: "United States" | "Canada") => void;
  onStateProvinceChange: (value: string) => void;
  onCityChange: (value: string) => void;
}

export function LocationSelector({
  country,
  stateProvince,
  city,
  onCountryChange,
  onStateProvinceChange,
  onCityChange,
}: LocationSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="space-y-2">
        <Label>Country</Label>
        <Select 
          value={country} 
          onValueChange={(value) => {
            onCountryChange(value as "United States" | "Canada");
            onStateProvinceChange(""); // Reset state/province when country changes
            onCityChange(""); // Reset city when country changes
          }}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="United States">United States</SelectItem>
            <SelectItem value="Canada">Canada</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{country === "United States" ? "State" : "Province"}</Label>
        <Select 
          value={stateProvince || "__all__"} 
          onValueChange={(value) => {
            onStateProvinceChange(value === "__all__" ? "" : value);
            // Don't reset city when state changes
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder={`Select ${country === "United States" ? "state" : "province"}`} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">All {country === "United States" ? "States" : "Provinces"}</SelectItem>
            {(country === "United States" ? usStates : canadianProvinces).map((item) => (
              <SelectItem key={item} value={item}>{item}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>City (Optional)</Label>
        <Input
          type="text"
          value={city}
          onChange={(e) => onCityChange(e.target.value)}
          placeholder="e.g., Los Angeles, Toronto"
          className="w-full"
        />
      </div>
    </div>
  );
}

