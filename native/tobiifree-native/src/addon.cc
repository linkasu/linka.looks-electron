#include <napi.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <optional>
#include <string>
#include <vector>

namespace {

struct Rect {
  double x = 0;
  double y = 0;
  double width = 0;
  double height = 0;
};

struct Point {
  double x = 0;
  double y = 0;
};

double Clamp01(double value) {
  return std::max(0.0, std::min(1.0, value));
}

Napi::Object PointToObject(Napi::Env env, const Point& point) {
  Napi::Object object = Napi::Object::New(env);
  object.Set("x", point.x);
  object.Set("y", point.y);
  return object;
}

Napi::Object RectToObject(Napi::Env env, const Rect& rect) {
  Napi::Object object = Napi::Object::New(env);
  object.Set("x", rect.x);
  object.Set("y", rect.y);
  object.Set("width", rect.width);
  object.Set("height", rect.height);
  return object;
}

class NativeTobiiTracker final : public Napi::ObjectWrap<NativeTobiiTracker> {
public:
  static void Init(Napi::Env env, Napi::Object exports) {
    Napi::Function ctor = DefineClass(env, "NativeTobiiTracker", {
      InstanceMethod("start", &NativeTobiiTracker::Start),
      InstanceMethod("stop", &NativeTobiiTracker::Stop),
      InstanceMethod("destroy", &NativeTobiiTracker::Destroy),
      InstanceMethod("setBounds", &NativeTobiiTracker::SetBounds),
      InstanceMethod("setTimeout", &NativeTobiiTracker::SetTimeoutMs),
      InstanceMethod("setScaleFactor", &NativeTobiiTracker::SetScaleFactor),
      InstanceMethod("setScreenRect", &NativeTobiiTracker::SetScreenRect),
      InstanceMethod("setDebugEnabled", &NativeTobiiTracker::SetDebugEnabled),
      InstanceMethod("startCalibration", &NativeTobiiTracker::StartCalibration),
      InstanceMethod("addCalibrationPoint", &NativeTobiiTracker::AddCalibrationPoint),
      InstanceMethod("finishCalibration", &NativeTobiiTracker::FinishCalibration),
      InstanceMethod("applyCalibration", &NativeTobiiTracker::ApplyCalibration),
      InstanceMethod("_emitTestGaze", &NativeTobiiTracker::EmitTestGaze)
    });

    exports.Set("NativeTobiiTracker", ctor);
  }

  explicit NativeTobiiTracker(const Napi::CallbackInfo& info) : Napi::ObjectWrap<NativeTobiiTracker>(info) {
    if (info.Length() < 1 || !info[0].IsFunction()) {
      Napi::TypeError::New(info.Env(), "NativeTobiiTracker requires an event listener").ThrowAsJavaScriptException();
      return;
    }

    listener_ = Napi::Persistent(info[0].As<Napi::Function>());
  }

private:
  Napi::Value Start(const Napi::CallbackInfo& info) {
    destroyed_ = false;
    EmitSimpleEvent(info.Env(), "ready");
    return ResolvedPromise(info.Env(), info.Env().Undefined());
  }

  Napi::Value Stop(const Napi::CallbackInfo& info) {
    ResetTarget(info.Env(), true);
    return info.Env().Undefined();
  }

  Napi::Value Destroy(const Napi::CallbackInfo& info) {
    destroyed_ = true;
    ResetTarget(info.Env(), true);
    listener_.Reset();
    return info.Env().Undefined();
  }

  Napi::Value SetBounds(const Napi::CallbackInfo& info) {
    if (info.Length() < 1 || !info[0].IsArray()) {
      Napi::TypeError::New(info.Env(), "setBounds expects an array").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }

    Napi::Array array = info[0].As<Napi::Array>();
    std::vector<Rect> nextBounds;
    nextBounds.reserve(array.Length());

    for (uint32_t i = 0; i < array.Length(); i++) {
      Napi::Value value = array.Get(i);
      if (!value.IsObject()) continue;

      Napi::Object object = value.As<Napi::Object>();
      Rect rect;
      rect.x = object.Get("x").ToNumber().DoubleValue();
      rect.y = object.Get("y").ToNumber().DoubleValue();
      rect.width = object.Get("width").ToNumber().DoubleValue();
      rect.height = object.Get("height").ToNumber().DoubleValue();
      nextBounds.push_back(rect);
    }

    bounds_ = std::move(nextBounds);
    return info.Env().Undefined();
  }

  Napi::Value SetTimeoutMs(const Napi::CallbackInfo& info) {
    if (info.Length() > 0 && info[0].IsNumber()) {
      timeoutMs_ = std::max(0, info[0].ToNumber().Int32Value());
    }
    return info.Env().Undefined();
  }

  Napi::Value SetScaleFactor(const Napi::CallbackInfo& info) {
    if (info.Length() > 0 && info[0].IsNumber()) {
      scaleFactor_ = info[0].ToNumber().DoubleValue();
    }
    return info.Env().Undefined();
  }

  Napi::Value SetScreenRect(const Napi::CallbackInfo& info) {
    if (info.Length() < 4) {
      Napi::TypeError::New(info.Env(), "setScreenRect expects x, y, width, height").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }

    screenRect_ = {
      info[0].ToNumber().DoubleValue(),
      info[1].ToNumber().DoubleValue(),
      info[2].ToNumber().DoubleValue(),
      info[3].ToNumber().DoubleValue()
    };
    return info.Env().Undefined();
  }

  Napi::Value SetDebugEnabled(const Napi::CallbackInfo& info) {
    debugEnabled_ = info.Length() > 0 && info[0].ToBoolean().Value();
    return info.Env().Undefined();
  }

  Napi::Value StartCalibration(const Napi::CallbackInfo& info) {
    return RejectedPromise(info.Env(), "NOT_IMPLEMENTED", "Native Tobii calibration is not implemented yet");
  }

  Napi::Value AddCalibrationPoint(const Napi::CallbackInfo& info) {
    return RejectedPromise(info.Env(), "NOT_IMPLEMENTED", "Native Tobii calibration is not implemented yet");
  }

  Napi::Value FinishCalibration(const Napi::CallbackInfo& info) {
    return RejectedPromise(info.Env(), "NOT_IMPLEMENTED", "Native Tobii calibration is not implemented yet");
  }

  Napi::Value ApplyCalibration(const Napi::CallbackInfo& info) {
    return RejectedPromise(info.Env(), "NOT_IMPLEMENTED", "Native Tobii calibration is not implemented yet");
  }

  Napi::Value EmitTestGaze(const Napi::CallbackInfo& info) {
    if (info.Length() < 2) {
      Napi::TypeError::New(info.Env(), "_emitTestGaze expects x and y").ThrowAsJavaScriptException();
      return info.Env().Undefined();
    }

    ProcessGaze(info.Env(), {
      info[0].ToNumber().DoubleValue(),
      info[1].ToNumber().DoubleValue()
    });
    return info.Env().Undefined();
  }

  void ProcessGaze(Napi::Env env, Point raw) {
    if (destroyed_) return;

    Point normalized{Clamp01(raw.x), Clamp01(raw.y)};
    Point screen{
      std::round((screenRect_.x + normalized.x * screenRect_.width) * scaleFactor_),
      std::round((screenRect_.y + normalized.y * screenRect_.height) * scaleFactor_)
    };
    int index = HitTest(screen);

    if (debugEnabled_) {
      Napi::Object event = Napi::Object::New(env);
      Napi::Object state = Napi::Object::New(env);
      state.Set("raw", PointToObject(env, raw));
      state.Set("normalized", PointToObject(env, normalized));
      state.Set("screen", PointToObject(env, screen));
      state.Set("screenRect", RectToObject(env, screenRect_));
      state.Set("boundsCount", static_cast<int>(bounds_.size()));
      state.Set("hitIndex", index);
      state.Set("softwareCalibration", false);
      event.Set("type", "debug");
      event.Set("state", state);
      Emit(env, event);
    }

    if (index < 0) {
      ResetTarget(env, false);
      return;
    }

    if (!currentIndex_.has_value() || currentIndex_.value() != index) {
      ResetTarget(env, false);
      currentIndex_ = index;
      enteredAt_ = std::chrono::steady_clock::now();
      clicked_ = false;
      EmitIndexedEvent(env, "enter", index, std::nullopt);
    }

    if (clicked_) return;

    auto elapsed = std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::steady_clock::now() - enteredAt_
    ).count();

    if (elapsed >= timeoutMs_) {
      clicked_ = true;
      EmitIndexedEvent(env, "click", index, 1);
    }
  }

  int HitTest(Point point) const {
    for (size_t i = 0; i < bounds_.size(); i++) {
      const Rect& rect = bounds_[i];
      if (
        point.x >= rect.x &&
        point.x <= rect.x + rect.width &&
        point.y >= rect.y &&
        point.y <= rect.y + rect.height
      ) {
        return static_cast<int>(i);
      }
    }
    return -1;
  }

  void ResetTarget(Napi::Env env, bool silent) {
    if (!currentIndex_.has_value()) return;
    currentIndex_.reset();
    clicked_ = false;
    if (!silent) EmitSimpleEvent(env, "exit");
  }

  void EmitSimpleEvent(Napi::Env env, const std::string& type) {
    Napi::Object event = Napi::Object::New(env);
    event.Set("type", type);
    Emit(env, event);
  }

  void EmitIndexedEvent(Napi::Env env, const std::string& type, int index, std::optional<int> count) {
    Napi::Object event = Napi::Object::New(env);
    event.Set("type", type);
    event.Set("index", index);
    if (count.has_value()) event.Set("count", count.value());
    Emit(env, event);
  }

  void Emit(Napi::Env env, Napi::Object event) {
    if (listener_.IsEmpty()) return;
    listener_.Call({ event });
  }

  Napi::Value ResolvedPromise(Napi::Env env, Napi::Value value) {
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    deferred.Resolve(value);
    return deferred.Promise();
  }

  Napi::Value RejectedPromise(Napi::Env env, const std::string& code, const std::string& message) {
    Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
    Napi::Error error = Napi::Error::New(env, message);
    error.Value().Set("code", code);
    deferred.Reject(error.Value());
    return deferred.Promise();
  }

  Napi::FunctionReference listener_;
  std::vector<Rect> bounds_;
  Rect screenRect_{0, 0, 1, 1};
  int timeoutMs_ = 1000;
  double scaleFactor_ = 1.0;
  bool debugEnabled_ = false;
  bool destroyed_ = false;
  bool clicked_ = false;
  std::optional<int> currentIndex_;
  std::chrono::steady_clock::time_point enteredAt_;
};

} // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  NativeTobiiTracker::Init(env, exports);
  return exports;
}

NODE_API_MODULE(tobiifree_native, Init)
