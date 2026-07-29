import { router } from 'expo-router';

import { HabitForm, toFrequencyConfig } from '@/components/habit-form';
import { habitRepository } from '@/composition/container';

export default function NewHabitScreen() {
  return (
    <HabitForm
      submitLabel="저장"
      onSubmit={async (value) => {
        await habitRepository.create({
          name: value.name,
          icon: value.icon,
          color: value.color,
          categoryId: value.categoryId,
          frequencyType: value.frequencyType,
          frequencyConfig: toFrequencyConfig(value),
          isArchived: false,
          sortOrder: 0,
        });
        router.back();
      }}
    />
  );
}
