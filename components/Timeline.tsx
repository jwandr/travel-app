'use client';

import React, { useMemo, useState } from "react";
import { addItem } from "@/lib/trips";

// Assumes each item MAY eventually have a `time` field like "09:00"
// If not present, we group into "Unscheduled"

function getHour(time?: string) {
  if (!time) return "unscheduled";
  const [h] = time.split(":");
  return `${h}:00`;
}

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}:00`);

export default function HourlyItineraryCanvas({ days, tripId }: any) {
  const [selectedDay, setSelectedDay] = useState(days?.[0]?.id);

  const activeDay = useMemo(() => {
    return days?.find((d: any) => d.id === selectedDay);
  }, [days, selectedDay]);

  const grouped = useMemo(() => {
    if (!activeDay?.items) return {};

    return activeDay.items.reduce((acc: any, item: any) => {
      const key = getHour(item.time);
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {});
  }, [activeDay]);

  return (
    <div className="flex gap-6 p-4">
      {/* LEFT: DAY SELECTOR */}
      <div className="w-48 border-r pr-4">
        <h2 className="font-bold mb-2">Days</h2>
        {days?.map((day: any) => (
          <button
            key={day.id}
            onClick={() => setSelectedDay(day.id)}
            className={`block w-full text-left p-2 rounded mb-1 ${
              selectedDay === day.id ? "bg-black text-white" : "bg-gray-100"
            }`}
          >
            Day {day.day_index}
            <div className="text-xs opacity-70">{day.date}</div>
          </button>
        ))}
      </div>

      {/* RIGHT: TIMELINE GRID */}
      <div className="flex-1">
        <h2 className="font-bold mb-4">
          Day {activeDay?.day_index} – {activeDay?.date}
        </h2>

        <div className="space-y-2">
          {HOURS.map((hour) => (
            <div key={hour} className="border rounded-lg p-2">
              <div className="text-xs font-semibold text-gray-500 mb-1">
                {hour}
              </div>

              <div className="space-y-1">
                {(grouped[hour] || []).map((item: any) => (
                  <div
                    key={item.id}
                    className="bg-gray-100 p-2 rounded flex justify-between"
                  >
                    <span>
                      {item.title} <span className="text-xs">({item.type})</span>
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => addItem(activeDay.id, tripId)}
                className="text-xs text-blue-600 mt-1"
              >
                + Add item
              </button>
            </div>
          ))}

          {/* Unscheduled */}
          <div className="border rounded-lg p-2 bg-yellow-50">
            <div className="text-xs font-semibold mb-1">Unscheduled</div>
            {(grouped["unscheduled"] || []).map((item: any) => (
              <div key={item.id} className="bg-white p-2 rounded mb-1">
                {item.title} ({item.type})
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}