FROM nginx

COPY nginx.conf /etc/nginx/nginx.conf

RUN rm /usr/share/nginx/html/index.html

COPY . /usr/share/nginx/html/