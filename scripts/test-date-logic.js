
import { isSameDay } from 'date-fns';

const messages = [
  { id: '1', timestamp: '2023-10-26T10:00:00.000Z', content: 'Msg 1' },
  { id: '2', timestamp: '2023-10-26T10:05:00.000Z', content: 'Msg 2' },
  { id: '3', timestamp: '2023-10-27T09:00:00.000Z', content: 'Msg 3' }
];

messages.forEach((message, index) => {
  const prevTimestamp = index > 0 ? messages[index - 1].timestamp : null;
  const isNewDay = index === 0 || !isSameDay(new Date(message.timestamp), new Date(prevTimestamp));
  
  console.log(`Index ${index}: Date=${message.timestamp}, IsNewDay=${isNewDay}`);
});
