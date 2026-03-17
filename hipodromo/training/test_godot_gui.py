import subprocess
import os
import time

def test():
    project_path = os.path.abspath("../")
    godot_binary = "godot"
    
    # Try with explicit macos driver and windowed mode
    cmd = [godot_binary, "--path", project_path, "--display-driver", "macos", "--windowed", "--resolution", "1280x720"]
    print(f"Running command: {' '.join(cmd)}")
    
    env = os.environ.copy()
    env["GODOT_BRIDGE_PORT"] = "9999"
    
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    
    print("Godot started. Waiting 10 seconds for window...")
    for _ in range(20):
        time.sleep(0.5)
        # Check if process is still alive
        if process.poll() is not None:
            print(f"Godot exited with code {process.poll()}")
            stdout, stderr = process.communicate()
            print(f"STDOUT: {stdout}")
            print(f"STDERR: {stderr}")
            return
            
    print("Godot still running. Checking output so far...")
    # This might block if not careful, but let's try
    try:
        # Non-blocking read would be better, but let's just terminate and read
        process.terminate()
        stdout, stderr = process.communicate()
        print(f"STDOUT: {stdout}")
        print(f"STDERR: {stderr}")
    except:
        pass

if __name__ == "__main__":
    test()
