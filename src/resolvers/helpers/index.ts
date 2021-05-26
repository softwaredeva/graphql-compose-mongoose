import { getFilterHelperArgOptsMap } from './filter';
import { getSearchHelperArgOptsMap } from './search';
import { getLimitHelperArgsOptsMap } from './limit';
import { getRecordHelperArgsOptsMap } from './record';

export * from './aliases';
export * from './filter';
export * from './search';
export * from './limit';
export * from './projection';
export * from './record';
export * from './skip';
export * from './sort';

export const MergeAbleHelperArgsOpts = {
  sort: 'boolean',
  skip: 'boolean',
  limit: getLimitHelperArgsOptsMap(),
  filter: getFilterHelperArgOptsMap(),
  search: getSearchHelperArgOptsMap(),
  record: getRecordHelperArgsOptsMap(),
  records: getRecordHelperArgsOptsMap(),
};
