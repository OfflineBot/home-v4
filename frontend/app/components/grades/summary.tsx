import { Stat } from "../block";
import {
  averageGrade,
  earnedECTS,
  formatAverage,
  formatECTS,
  type Grade,
} from "../../lib/grades";

export function GradeSummary({ modules }: { modules: Grade[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Stat label="Average grade" value={formatAverage(averageGrade(modules))} />
      <Stat label="ECTS" value={formatECTS(earnedECTS(modules))} />
      <Stat label="Modules" value={String(modules.length)} />
    </div>
  );
}
