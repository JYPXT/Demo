import Axios from "axios";
import { Message } from "element-ui";
import router from "@router";
import { setAuthorization, uRefreshToken } from "./utils";

// 放前面会导致 crAxios extends oAxios 调用crAxios(config)报错
// 放后面， create会重写get、post等方法 AxiosPromise会被重写掉
const timeout = 20000;
const oAxios = Axios.create({
  // baseURL: '',
  timeout,
});

let stackid = 0;
let stacks = Object.create(null);
let stacksTimer = null;
/*
 * 刷新token之后把stacks清掉 (失败的才在这里，现在延迟再删
 * 否则会每次请求（成功、失败）都会收集回调方法，可能会同时请求多次，失败多次
 * 失败（调用、清除了），失败（stacks被清除了这里就拿不到了）)
 * */
const clearStacks = () => {
  stacksTimer && clearTimeout(stacksTimer);
  stacksTimer = setTimeout(() => {
    stacks = Object.create(null);
    tokenExpiresAxiosConfigs = [];
  }, timeout);
};

class AxiosPromise extends Promise {
  constructor(callback) {
    super(callback);
  }

  then(success, fail) {
    if (!stacks[stackid]) {
      stacks[stackid] = [];
    }
    stacks[stackid].push(success, fail);
    return super.then(success, fail);
  }

  catch(fail) {
    if (!stacks[stackid]) {
      stacks[stackid] = [];
    }
    stacks[stackid].push(undefined, fail);
    return super.catch(fail);
  }
}

class crAxios extends oAxios {
  constructor(config) {
    super(config);
  }

  static get(url, config = {}) {
    config["stackid"] = ++stackid;
    return AxiosPromise.resolve(super.get(url, config));
  }

  static post(url, data = {}, config = {}) {
    config["stackid"] = ++stackid;
    return AxiosPromise.resolve(super.post(url, data, config));
  }

  static put(url, data = {}, config = {}) {
    config["stackid"] = ++stackid;
    return AxiosPromise.resolve(super.put(url, data, config));
  }

  static delete(url, config = {}) {
    config["stackid"] = ++stackid;
    return AxiosPromise.resolve(super.delete(url, config));
  }
}

// 记录需要刷新的configs
let tokenExpiresAxiosConfigs = [];

// 登录已过期
const tokenExpiresLogout = () => {
  window.sessionStorage.clear();
  tokenExpiresAxiosConfigs = [];
  router.push({ name: "login" });
};

let refreshTokening = false;
const refreshToken = () => {
  if (refreshTokening) return;
  refreshTokening = true;
  uRefreshToken().then(({ code, msg }) => {
    if (code === 200) {
      // 将需要刷新的configs请求一遍
      tokenExpiresAxiosConfigs.forEach((config) => {
        const stackid = config.stackid;
        const stack = stacks[stackid];
        setAuthorization(config);
        let promise = oAxios(config);
        while (stack && stack.length) {
          promise = promise.then(stack.shift(), stack.shift());
        }
      });
      clearStacks();
    } else if (code === 10001) {
      // 如果refreshToken也过期了，退出登录
      tokenExpiresLogout();
    } else {
      Message.error(msg);
    }
    refreshTokening = false;
  });
};

// http请求拦截器
crAxios.interceptors.request.use(
  (config) => {
    setAuthorization(config);
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// http响应拦截器
crAxios.interceptors.response.use(
  (response) => {
    const {
      config,
      data: { RspCode },
    } = response;

    if (RspCode === 200) {
      // 成功的按自己的逻辑来
    } else {
      if (
        RspCode === 401 ||
        RspCode === 10001 ||
        (urlIsLogout && RspCode === 10002)
      ) {
        // 401、refreshToken过期、退出登录且Token过期
        tokenExpiresLogout();
      } else if (RspCode === 10002) {
        // Token过期需要刷新的
        tokenExpiresAxiosConfigs.push(config);
        refreshToken();
      } else {
        return Promise.reject(RspCode);
      }

      delete stacks[config.stackid];
      return data;
    }
  },
  (error) => {
    return Promise.reject(error);
  }
);

crAxios.upload = (url, data = {}, setting = {}) => {
  const formdata = new FormData();
  for (const o in data) {
    if (data[o] instanceof FileList) {
      data[o].forEach((file) => {
        formdata.append(o, file);
      });
    } else {
      formdata.append(o, data[o]);
    }
  }
  const config = Object.assign(
    {
      headers: {
        "Content-Type": "multipart/form-data",
      },
    },
    setting
  );
  return crAxios.post(url, formdata, config);
};

export const CrAxios = crAxios;
