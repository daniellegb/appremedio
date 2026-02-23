import { Medication, DoseEvent } from '../../types';

export interface TreatmentDose {
  doseIndex: number;
  scheduledAt: Date;
  status: 'pending' | 'taken' | 'missed' | 'not_started';
  time: string;
  date: string;
}

export interface TreatmentSchedule {
  medicationId: string;
  totalDoses: number;
  doses: TreatmentDose[];
  treatmentStartAt: Date | null;
}

export const TreatmentDomainService = {
  calculateTotalDoses(med: Medication): number {
    if (med.usageCategory !== 'period') return 0;
    const duration = med.durationDays || 0;
    const dosesPerDay = (med.times || []).length;
    return duration * dosesPerDay;
  },

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  generateSchedule(
    med: Medication,
    recordedDoses: DoseEvent[],
    now: Date = new Date()
  ): TreatmentSchedule {
    const totalDoses = this.calculateTotalDoses(med);
    const times = med.times || [];
    const dosesPerDay = times.length;

    if (totalDoses === 0 || dosesPerDay === 0) {
      return { medicationId: med.id, totalDoses: 0, doses: [], treatmentStartAt: null };
    }

    // Find the first dose actually taken to anchor the treatment
    const firstTaken = [...recordedDoses]
      .filter(d => d.medicationId === med.id && d.status === 'taken')
      .sort((a, b) => {
        const dateA = new Date(`${a.date}T${a.scheduledTime}`).getTime();
        const dateB = new Date(`${b.date}T${b.scheduledTime}`).getTime();
        return dateA - dateB;
      })[0];

    let startAtDate: string;
    let startTimeIdx: number;
    const hasStarted = !!firstTaken;

    if (hasStarted) {
      startAtDate = firstTaken.date;
      startTimeIdx = times.indexOf(firstTaken.scheduledTime);
      if (startTimeIdx === -1) startTimeIdx = 0;
    } else {
      // If not started, we want to show potential doses for "today" or "startDate"
      // so the user can pick one to start the treatment.
      const todayStr = this.formatDate(now);
      const startDateStr = med.startDate || todayStr;
      
      // If today is before startDate, start at startDate
      if (todayStr < startDateStr) {
        startAtDate = startDateStr;
      } else {
        // If today is after or equal to startDate, start "today"
        startAtDate = todayStr;
      }
      startTimeIdx = 0;
    }

    const doses: TreatmentDose[] = [];
    // Use noon to avoid DST issues when manipulating dates
    let currentDate = new Date(startAtDate + 'T12:00:00');
    let currentTimeIdx = startTimeIdx;
    let prevTime = "";

    for (let i = 0; i < totalDoses; i++) {
      const scheduledTime = times[currentTimeIdx];
      
      if (i > 0 && scheduledTime <= prevTime) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
      
      const dateStr = this.formatDate(currentDate);
      const scheduledAt = new Date(`${dateStr}T${scheduledTime}`);
      
      const recorded = recordedDoses.find(d => 
        d.medicationId === med.id && 
        d.date === dateStr && 
        d.scheduledTime === scheduledTime
      );

      let status: 'pending' | 'taken' | 'missed' | 'not_started' = 'not_started';
      
      if (recorded?.status === 'taken') {
        status = 'taken';
      } else if (hasStarted) {
        if (recorded?.status === 'missed') {
          status = 'missed';
        } else {
          const toleranceMs = 60 * 60 * 1000; // 1 hour tolerance
          if (now.getTime() > scheduledAt.getTime() + toleranceMs) {
            status = 'missed';
          } else {
            status = 'pending';
          }
        }
      } else {
        if (i === 0) {
          status = 'pending';
        } else {
          status = 'not_started';
        }
      }

      doses.push({
        doseIndex: i + 1,
        scheduledAt,
        status,
        time: scheduledTime,
        date: dateStr
      });

      prevTime = scheduledTime;
      currentTimeIdx = (currentTimeIdx + 1) % dosesPerDay;
    }

    return {
      medicationId: med.id,
      totalDoses,
      doses,
      treatmentStartAt: hasStarted ? new Date(`${firstTaken.date}T${firstTaken.scheduledTime}`) : null
    };
  }
};
