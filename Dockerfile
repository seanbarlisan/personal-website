# Stable NGINX image we plan to use 
FROM nginx:stable 

# Copy the src directory into the NGINX HTML directory, forcefully uses the index.html file
COPY src/ /usr/share/nginx/html


# docker build -t demo-nginx .
# docker run -it --rm -d -p 8080:80 --name demonginx demo-nginx && docker attach demonginx