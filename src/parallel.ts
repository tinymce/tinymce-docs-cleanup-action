/**
 * This takes in a normal generator that returns promises and returns an async
 * generator that runs `max` of those promises in parallel to improve throughput.
 */
export async function* parallelGenerator<T>(max: number, source: Generator<Promise<T>, void, unknown>): AsyncGenerator<T, void, unknown> {
  if (max < 1) {
    throw new Error('max must be at least 1');
  }
  const wrap = (i: number, task: IteratorResult<Promise<T>, void>): Promise<[number, IteratorResult<T>]> => new Promise((resolve) => {
    if (task.done) {
      resolve([ i, { done: true, value: undefined }]);
    } else {
      task.value.then((v) => resolve([ i, { done: false, value: v }]));
    }
  });
  const tasks: (Promise<[number, IteratorResult<T, void>]>)[] = [];
  for (let i = 0; i < max; i++) {
    tasks.push(wrap(i, source.next()));
  }
  let tasksAndNull: (Promise<[number, IteratorResult<T, void>]> | null)[];
  while (true) {
    const [ i, v ] = await Promise.race(tasks);
    if (v.done) {
      // move the tasks over to the nullable list
      tasksAndNull = tasks.splice(0, tasks.length);
      tasksAndNull[i] = null;
      break;
    } else {
      tasks[i] = wrap(i, source.next());
      yield v.value;
    }
  }
  let filteredTasks = tasksAndNull.filter((v) => v !== null);
  while (filteredTasks.length > 0) {
    const [ i, v ] = await Promise.race(filteredTasks);
    tasksAndNull[i] = null;
    if (!v.done) {
      yield v.value;
    }
    filteredTasks = tasksAndNull.filter((t) => t !== null);
  }
}