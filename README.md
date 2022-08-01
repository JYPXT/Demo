### axios_interceptors.js

#### 最常见的处理Token过期是：例如提前5分钟检查一遍Token是否过期。 个人觉得没必要setTimeout定期检查，发请求的时候检查又有漏洞（长时间没操作浏览器），通过重写axios来处理这个问题。

axios拦截器处理Token过期，执行refreshToken重新获取Token，重新发起请求示例
- 收集请求回调。
- Token没过期? 清理。
- Token过期? 执行refreshToken成功，重新拼接回调方法，重新发起请求。