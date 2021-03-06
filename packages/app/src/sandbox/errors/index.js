// @flow
import { dispatch, actions } from 'codesandbox-api';

import type TranspiledModule from '../eval/transpiled-module';

import type { ErrorRecord } from '../react-error-overlay/utils/errorRegister';
import { getCurrentManager } from '../compile';

type TModuleError = Error & {
  hideLine?: boolean,
  line?: number,
  path?: Object,
  severity?: string,
  payload?: Object,
  tModule?: TranspiledModule,
};

function buildErrorMessage(e: TModuleError) {
  const title = e.name;
  const message = e.message;
  let line = null;
  let column = null;
  if (!e.hideLine) {
    // Safari
    if (e.line != null) {
      line = e.line;

      // FF
    } else if (e.lineNumber != null) {
      line = e.lineNumber;

      // Chrome
    } else if (e.stack) {
      const matched = e.stack.match(/<anonymous>:(\d+):(\d+)/);
      if (matched) {
        line = matched[1];
        column = matched[2];
      } else {
        // Maybe it's a babel transpiler error
        const babelMatched = e.stack.match(/(\d+):(\d+)/);
        if (babelMatched) {
          line = babelMatched[1];
          column = babelMatched[2];
        }
      }
    }
  }

  return {
    path: e.tModule ? e.tModule.module.path : e.path,
    title,
    message,
    line: parseInt(line, 10),
    column: parseInt(column, 10),
    payload: e.payload || {},
    severity: e.severity || 'error',
  };
}

function buildDynamicError(ref: ErrorRecord) {
  const manager = getCurrentManager();

  const relevantFrame = ref.enhancedFrames.find(r => {
    try {
      return (
        manager &&
        !!manager.resolveTranspiledModule(
          (r._originalFileName || r.fileName || '')
            .replace(location.origin, '')
            .replace('file://', ''),
          '/'
        )
      );
    } catch (e) {
      /* don't do anything */
      return false;
    }
  });

  if (relevantFrame && manager) {
    const fileName = relevantFrame._originalFileName || relevantFrame.fileName;
    if (fileName) {
      const tModule = manager.resolveTranspiledModule(
        fileName.replace(location.origin, '').replace('file://', ''),
        '/'
      );

      if (tModule) {
        const module = tModule.module;
        return {
          type: 'action',
          action: 'show-error',
          path: module.parent ? module.parent.path : module.path,
          title: ref.error.name,
          message: ref.error.message,
          line: relevantFrame._originalLineNumber,
          column: relevantFrame._originalColumnNumber,
          payload: {},
          severity: 'error',
        };
      }
    }
  } else {
    const error: TModuleError = ref.error;
    const tModule = error.tModule;

    if (tModule) {
      const newError = {
        ...buildErrorMessage(error),
        type: 'action',
        action: 'show-error',
      };

      return newError;
    }
  }

  return null;
}

/* eslint-disable no-underscore-dangle */
export default function showError(ref: ErrorRecord) {
  const errorToSend = buildDynamicError(ref);
  if (errorToSend) {
    dispatch(
      actions.error.show(errorToSend.title, errorToSend.message, {
        line: errorToSend.line,
        column: errorToSend.column,
        path: errorToSend.path,
        payload: errorToSend.payload,
      })
    );
  }
}
