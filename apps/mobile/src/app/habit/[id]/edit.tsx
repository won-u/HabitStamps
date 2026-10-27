import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { EMPTY_DENIM, type Habit } from '@habit-tracker/core';

import { HabitForm, toFrequencyConfig } from '@/components/habit-form';
import { habitRepository } from '@/composition/container';

export default function EditHabitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [habit, setHabit] = useState<Habit | null>(null);

  useEffect(() => {
    habitRepository.getById(id).then(setHabit);
  }, [id]);

  if (!habit) return null;

  return (
    <HabitForm
      initial={{
        name: habit.name,
        icon: habit.icon,
        color: habit.color,
        categoryId: habit.categoryId,
        frequencyType: habit.frequencyType,
        weekdays: habit.frequencyConfig.weekdays ?? [1, 2, 3, 4, 5],
        timesPerWeek: habit.frequencyConfig.timesPerWeek ?? 3,
        timesPerMonth: habit.frequencyConfig.timesPerMonth ?? 10,
        isDenim: habit.denim !== null,
      }}
      hasDenimRecords={
        habit.denim !== null &&
        (habit.denim.priorWears > 0 || habit.denim.washes.length > 0 || habit.denim.frequentWashAt !== null)
      }
      submitLabel="저장"
      onSubmit={async (value) => {
        await habitRepository.update(habit.id, {
          name: value.name,
          icon: value.icon,
          color: value.color,
          categoryId: value.categoryId,
          frequencyType: value.frequencyType,
          frequencyConfig: toFrequencyConfig(value),
          // Turning denim on keeps what was there; off drops it.
          denim: value.isDenim ? (habit.denim ?? EMPTY_DENIM) : null,
        });
        router.back();
      }}
      onArchive={
        habit.isArchived
          ? undefined
          : async () => {
              await habitRepository.update(habit.id, { isArchived: true });
              // Not router.back(): that would return to this now-hidden habit's detail screen.
              router.replace('/(tabs)');
            }
      }
      onDelete={async () => {
        await habitRepository.softDelete(habit.id);
        // Not router.back(): that would return to this now-deleted habit's detail screen.
        router.replace('/(tabs)');
      }}
    />
  );
}
